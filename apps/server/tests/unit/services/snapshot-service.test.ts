import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SnapshotService } from '@/services/snapshot-service.js';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

describe('snapshot-service.ts', () => {
  let service: SnapshotService;
  let testDir: string;
  let gitRepo: string;

  beforeEach(async () => {
    service = new SnapshotService();

    // Create temporary test directory
    testDir = path.join(os.tmpdir(), `snapshot-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });

    // Create a git repository for testing
    gitRepo = path.join(testDir, 'test-repo');
    await fs.mkdir(gitRepo, { recursive: true });

    // Initialize git repo
    await execAsync('git init', { cwd: gitRepo });
    await execAsync('git config user.email "test@example.com"', { cwd: gitRepo });
    await execAsync('git config user.name "Test User"', { cwd: gitRepo });

    // Create initial commit with .automakeit directory
    await fs.mkdir(path.join(gitRepo, '.automakeit'), { recursive: true });
    await fs.writeFile(path.join(gitRepo, '.automakeit/.gitkeep'), '');
    await fs.writeFile(path.join(gitRepo, 'README.md'), '# Test Project');
    await execAsync('git add .', { cwd: gitRepo });
    await execAsync('git commit -m "Initial commit"', { cwd: gitRepo });
  });

  afterEach(async () => {
    // Cleanup
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('createSnapshot', () => {
    it('should create a snapshot with current commit hash', async () => {
      const snapshot = await service.createSnapshot(gitRepo, 'feature-1', gitRepo, 'main');

      expect(snapshot).toBeDefined();
      expect(snapshot.featureId).toBe('feature-1');
      expect(snapshot.commitHash).toMatch(/^[0-9a-f]{40}$/); // Full SHA-1
      expect(snapshot.worktreePath).toBe(path.resolve(gitRepo));
      expect(snapshot.branch).toBe('main');
      expect(snapshot.status).toBe('active');
      expect(snapshot.createdAt).toBeDefined();
    });

    it('should save snapshot to snapshots.json', async () => {
      await service.createSnapshot(gitRepo, 'feature-1', gitRepo, 'main');

      const snapshotsFile = path.join(gitRepo, '.automakeit', 'snapshots.json');
      const exists = await fs
        .access(snapshotsFile)
        .then(() => true)
        .catch(() => false);

      expect(exists).toBe(true);

      const data = await fs.readFile(snapshotsFile, 'utf-8');
      const snapshots = JSON.parse(data);
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0].featureId).toBe('feature-1');
    });

    it('should handle multiple snapshots', async () => {
      await service.createSnapshot(gitRepo, 'feature-1', gitRepo, 'feature-1');
      await service.createSnapshot(gitRepo, 'feature-2', gitRepo, 'feature-2');

      const snapshots = await service.getAllSnapshots(gitRepo);
      expect(snapshots).toHaveLength(2);
      expect(snapshots.map((s: { featureId: string }) => s.featureId)).toEqual([
        'feature-1',
        'feature-2',
      ]);
    });
  });

  describe('getSnapshot', () => {
    it('should retrieve an existing snapshot', async () => {
      const created = await service.createSnapshot(gitRepo, 'feature-1', gitRepo, 'main');
      const retrieved = await service.getSnapshot(gitRepo, 'feature-1');

      expect(retrieved).toBeDefined();
      expect(retrieved?.commitHash).toBe(created.commitHash);
    });

    it('should return null for non-existent snapshot', async () => {
      const snapshot = await service.getSnapshot(gitRepo, 'non-existent');
      expect(snapshot).toBeNull();
    });
  });

  describe('rollback', () => {
    it('should rollback to snapshot commit', async () => {
      // Create initial snapshot
      const snapshot = await service.createSnapshot(gitRepo, 'feature-1', gitRepo, 'main');

      // Make changes
      await fs.writeFile(path.join(gitRepo, 'new-file.txt'), 'new content');
      await execAsync('git add .', { cwd: gitRepo });
      await execAsync('git commit -m "Add new file"', { cwd: gitRepo });

      // Verify file exists
      const beforeRollback = await fs
        .access(path.join(gitRepo, 'new-file.txt'))
        .then(() => true)
        .catch(() => false);
      expect(beforeRollback).toBe(true);

      // Rollback
      const success = await service.rollback(gitRepo, 'feature-1');
      expect(success).toBe(true);

      // Verify file is gone
      const afterRollback = await fs
        .access(path.join(gitRepo, 'new-file.txt'))
        .then(() => true)
        .catch(() => false);
      expect(afterRollback).toBe(false);

      // Verify commit hash matches snapshot
      const { stdout } = await execAsync('git rev-parse HEAD', { cwd: gitRepo });
      expect(stdout.trim()).toBe(snapshot.commitHash);
    });

    it('should update snapshot status to rolled-back', async () => {
      await service.createSnapshot(gitRepo, 'feature-1', gitRepo, 'main');
      await service.rollback(gitRepo, 'feature-1');

      const snapshot = await service.getSnapshot(gitRepo, 'feature-1');
      expect(snapshot?.status).toBe('rolled-back');
    });

    it('should throw error if snapshot does not exist', async () => {
      await expect(service.rollback(gitRepo, 'non-existent')).rejects.toThrow('No snapshot found');
    });

    it('should return false if already rolled back', async () => {
      await service.createSnapshot(gitRepo, 'feature-1', gitRepo, 'main');
      await service.rollback(gitRepo, 'feature-1');

      const secondRollback = await service.rollback(gitRepo, 'feature-1');
      expect(secondRollback).toBe(false);
    });
  });

  describe('markCompleted', () => {
    it('should mark snapshot as completed', async () => {
      await service.createSnapshot(gitRepo, 'feature-1', gitRepo, 'main');
      await service.markCompleted(gitRepo, 'feature-1');

      const snapshot = await service.getSnapshot(gitRepo, 'feature-1');
      expect(snapshot?.status).toBe('completed');
    });
  });

  describe('deleteSnapshot', () => {
    it('should delete a snapshot', async () => {
      await service.createSnapshot(gitRepo, 'feature-1', gitRepo, 'main');
      await service.deleteSnapshot(gitRepo, 'feature-1');

      const snapshot = await service.getSnapshot(gitRepo, 'feature-1');
      expect(snapshot).toBeNull();
    });
  });

  describe('cleanupOldSnapshots', () => {
    it('should clean up old completed snapshots', async () => {
      // Create snapshots
      await service.createSnapshot(gitRepo, 'feature-1', gitRepo, 'main');
      await service.createSnapshot(gitRepo, 'feature-2', gitRepo, 'main');

      // Mark as completed and manually set old date
      await service.markCompleted(gitRepo, 'feature-1');

      const snapshots = await service['loadSnapshots'](gitRepo);
      const old = snapshots.get('feature-1');
      if (old) {
        old.createdAt = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(); // 40 days ago
        await service['saveSnapshots'](gitRepo, snapshots);
      }

      // Cleanup
      const deletedCount = await service.cleanupOldSnapshots(gitRepo, 30);

      expect(deletedCount).toBe(1);

      // Verify feature-1 is deleted but feature-2 remains
      const remaining = await service.getAllSnapshots(gitRepo);
      expect(remaining).toHaveLength(1);
      expect(remaining[0].featureId).toBe('feature-2');
    });

    it('should not delete active or rolled-back snapshots', async () => {
      await service.createSnapshot(gitRepo, 'feature-1', gitRepo, 'main');
      await service.createSnapshot(gitRepo, 'feature-2', gitRepo, 'main');

      // Set old dates
      const snapshots = await service['loadSnapshots'](gitRepo);
      for (const snapshot of snapshots.values()) {
        snapshot.createdAt = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
      }
      await service['saveSnapshots'](gitRepo, snapshots);

      const deletedCount = await service.cleanupOldSnapshots(gitRepo, 30);

      // Should not delete because they're still 'active'
      expect(deletedCount).toBe(0);
    });
  });
});
