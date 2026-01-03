/**
 * Snapshot Service
 *
 * Manages Git snapshots for feature rollback functionality.
 * Creates snapshots before feature execution and allows rollback to previous state.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import * as secureFs from '../lib/secure-fs.js';
import { createLogger } from '@automakeit/utils';
import { getAutoMakeItDir } from '@automakeit/platform';

const execAsync = promisify(exec);
const logger = createLogger('Snapshot');

export interface Snapshot {
  featureId: string;
  commitHash: string;
  worktreePath: string;
  branch: string;
  createdAt: string;
  status: 'active' | 'completed' | 'rolled-back';
  description?: string;
}

export class SnapshotService {
  /**
   * Get the snapshots file path for a project
   */
  private getSnapshotsFilePath(projectPath: string): string {
    const automakeitDir = getAutoMakeItDir(projectPath);
    return path.join(automakeitDir, 'snapshots.json');
  }

  /**
   * Load all snapshots for a project
   */
  private async loadSnapshots(projectPath: string): Promise<Map<string, Snapshot>> {
    const snapshotsFile = this.getSnapshotsFilePath(projectPath);
    const snapshots = new Map<string, Snapshot>();

    try {
      const data = (await secureFs.readFile(snapshotsFile, 'utf-8')) as string;
      const parsed = JSON.parse(data);

      if (Array.isArray(parsed)) {
        for (const snapshot of parsed) {
          if (this.isValidSnapshot(snapshot)) {
            snapshots.set(snapshot.featureId, snapshot);
          }
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.warn('Failed to load snapshots:', error);
      }
    }

    return snapshots;
  }

  /**
   * Save snapshots to disk
   */
  private async saveSnapshots(
    projectPath: string,
    snapshots: Map<string, Snapshot>
  ): Promise<void> {
    const snapshotsFile = this.getSnapshotsFilePath(projectPath);
    const data = JSON.stringify(Array.from(snapshots.values()), null, 2);
    await secureFs.writeFile(snapshotsFile, data, 'utf-8');
  }

  /**
   * Validate snapshot object structure
   */
  private isValidSnapshot(obj: unknown): obj is Snapshot {
    if (!obj || typeof obj !== 'object') return false;
    const snapshot = obj as Partial<Snapshot>;

    return (
      typeof snapshot.featureId === 'string' &&
      typeof snapshot.commitHash === 'string' &&
      typeof snapshot.worktreePath === 'string' &&
      typeof snapshot.branch === 'string' &&
      typeof snapshot.createdAt === 'string' &&
      typeof snapshot.status === 'string'
    );
  }

  /**
   * Create a snapshot before feature execution
   *
   * @param projectPath - Project root path
   * @param featureId - Feature ID
   * @param worktreePath - Worktree path where feature will be executed
   * @param branch - Branch name
   * @returns Created snapshot
   */
  async createSnapshot(
    projectPath: string,
    featureId: string,
    worktreePath: string,
    branch: string
  ): Promise<Snapshot> {
    logger.info(`Creating snapshot for feature ${featureId} at ${worktreePath}`);

    try {
      // Get current commit hash
      const { stdout: hashOutput } = await execAsync('git rev-parse HEAD', {
        cwd: worktreePath,
      });
      const commitHash = hashOutput.trim();

      // Check if there are uncommitted changes
      const { stdout: statusOutput } = await execAsync('git status --porcelain', {
        cwd: worktreePath,
      });

      if (statusOutput.trim()) {
        logger.warn(
          `Worktree has uncommitted changes. Snapshot will point to last commit ${commitHash}`
        );
      }

      // Create snapshot object
      const snapshot: Snapshot = {
        featureId,
        commitHash,
        worktreePath: path.resolve(worktreePath),
        branch,
        createdAt: new Date().toISOString(),
        status: 'active',
        description: `Snapshot before executing feature ${featureId}`,
      };

      // Save to disk
      const snapshots = await this.loadSnapshots(projectPath);
      snapshots.set(featureId, snapshot);
      await this.saveSnapshots(projectPath, snapshots);

      logger.info(`Snapshot created: ${commitHash.slice(0, 7)} for feature ${featureId}`);
      return snapshot;
    } catch (error) {
      logger.error(`Failed to create snapshot for feature ${featureId}:`, error);
      throw new Error(`Snapshot creation failed: ${(error as Error).message}`);
    }
  }

  /**
   * Get snapshot for a specific feature
   */
  async getSnapshot(projectPath: string, featureId: string): Promise<Snapshot | null> {
    const snapshots = await this.loadSnapshots(projectPath);
    return snapshots.get(featureId) || null;
  }

  /**
   * Rollback a feature to its snapshot state
   *
   * @param projectPath - Project root path
   * @param featureId - Feature ID to rollback
   * @returns true if rollback succeeded
   */
  async rollback(projectPath: string, featureId: string): Promise<boolean> {
    logger.info(`Rolling back feature ${featureId}`);

    const snapshot = await this.getSnapshot(projectPath, featureId);
    if (!snapshot) {
      throw new Error(`No snapshot found for feature ${featureId}`);
    }

    if (snapshot.status === 'rolled-back') {
      logger.warn(`Feature ${featureId} already rolled back`);
      return false;
    }

    try {
      const { worktreePath, commitHash } = snapshot;

      // 1. Reset to snapshot commit (hard reset)
      logger.info(`Resetting ${worktreePath} to commit ${commitHash.slice(0, 7)}`);
      await execAsync(`git reset --hard ${commitHash}`, { cwd: worktreePath });

      // 2. Clean untracked files and directories
      logger.info(`Cleaning untracked files in ${worktreePath}`);
      await execAsync('git clean -fd', { cwd: worktreePath });

      // 3. Update snapshot status
      snapshot.status = 'rolled-back';
      const snapshots = await this.loadSnapshots(projectPath);
      snapshots.set(featureId, snapshot);
      await this.saveSnapshots(projectPath, snapshots);

      logger.info(`Successfully rolled back feature ${featureId} to ${commitHash.slice(0, 7)}`);
      return true;
    } catch (error) {
      logger.error(`Failed to rollback feature ${featureId}:`, error);
      throw new Error(`Rollback failed: ${(error as Error).message}`);
    }
  }

  /**
   * Mark snapshot as completed (feature execution succeeded)
   */
  async markCompleted(projectPath: string, featureId: string): Promise<void> {
    const snapshot = await this.getSnapshot(projectPath, featureId);
    if (!snapshot) {
      logger.warn(`No snapshot found for feature ${featureId} to mark complete`);
      return;
    }

    snapshot.status = 'completed';
    const snapshots = await this.loadSnapshots(projectPath);
    snapshots.set(featureId, snapshot);
    await this.saveSnapshots(projectPath, snapshots);

    logger.info(`Marked snapshot for feature ${featureId} as completed`);
  }

  /**
   * Delete a snapshot (cleanup after successful merge)
   */
  async deleteSnapshot(projectPath: string, featureId: string): Promise<void> {
    const snapshots = await this.loadSnapshots(projectPath);

    if (snapshots.delete(featureId)) {
      await this.saveSnapshots(projectPath, snapshots);
      logger.info(`Deleted snapshot for feature ${featureId}`);
    }
  }

  /**
   * Get all snapshots for a project
   */
  async getAllSnapshots(projectPath: string): Promise<Snapshot[]> {
    const snapshots = await this.loadSnapshots(projectPath);
    return Array.from(snapshots.values());
  }

  /**
   * Clean up old completed snapshots (older than specified days)
   */
  async cleanupOldSnapshots(projectPath: string, daysOld: number = 30): Promise<number> {
    const snapshots = await this.loadSnapshots(projectPath);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    let deletedCount = 0;
    for (const [featureId, snapshot] of snapshots.entries()) {
      if (snapshot.status === 'completed') {
        const snapshotDate = new Date(snapshot.createdAt);
        if (snapshotDate < cutoffDate) {
          snapshots.delete(featureId);
          deletedCount++;
        }
      }
    }

    if (deletedCount > 0) {
      await this.saveSnapshots(projectPath, snapshots);
      logger.info(`Cleaned up ${deletedCount} old snapshots`);
    }

    return deletedCount;
  }
}

// Singleton instance
let snapshotServiceInstance: SnapshotService | null = null;

/**
 * Get singleton instance of SnapshotService
 */
export function getSnapshotService(): SnapshotService {
  if (!snapshotServiceInstance) {
    snapshotServiceInstance = new SnapshotService();
  }
  return snapshotServiceInstance;
}
