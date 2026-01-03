/**
 * POST /api/features/rollback
 * Rollback a feature to its snapshot state
 */

import type { Request, Response } from 'express';
import { getSnapshotService } from '../../services/snapshot-service.js';
import { createLogger } from '@automakeit/utils';

const logger = createLogger('RollbackRoute');

export async function rollbackFeature(req: Request, res: Response): Promise<void> {
  try {
    const { projectPath, featureId } = req.body;

    if (!projectPath || typeof projectPath !== 'string') {
      res.status(400).json({ error: 'projectPath is required' });
      return;
    }

    if (!featureId || typeof featureId !== 'string') {
      res.status(400).json({ error: 'featureId is required' });
      return;
    }

    const snapshotService = getSnapshotService();

    // Check if snapshot exists
    const snapshot = await snapshotService.getSnapshot(projectPath, featureId);
    if (!snapshot) {
      res.status(404).json({
        error: `No snapshot found for feature ${featureId}`,
      });
      return;
    }

    // Perform rollback
    logger.info(`Rolling back feature ${featureId} in project ${projectPath}`);
    const success = await snapshotService.rollback(projectPath, featureId);

    if (success) {
      res.json({
        success: true,
        message: `Feature ${featureId} rolled back to commit ${snapshot.commitHash.slice(0, 7)}`,
        snapshot: {
          commitHash: snapshot.commitHash,
          createdAt: snapshot.createdAt,
          status: 'rolled-back',
        },
      });
    } else {
      res.status(400).json({
        error: 'Rollback failed - feature may have already been rolled back',
      });
    }
  } catch (error) {
    logger.error('Rollback failed:', error);
    res.status(500).json({
      error: 'Rollback failed',
      message: (error as Error).message,
    });
  }
}
