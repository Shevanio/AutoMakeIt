/**
 * GET /api/features/:featureId/snapshot
 * Get snapshot information for a feature
 */

import type { Request, Response } from 'express';
import { getSnapshotService } from '../../services/snapshot-service.js';
import { createLogger } from '@automakeit/utils';

const logger = createLogger('SnapshotRoute');

export async function getFeatureSnapshot(req: Request, res: Response): Promise<void> {
  try {
    const { featureId } = req.params;
    const { projectPath } = req.query;

    if (!projectPath || typeof projectPath !== 'string') {
      res.status(400).json({ error: 'projectPath query parameter is required' });
      return;
    }

    const snapshotService = getSnapshotService();
    const snapshot = await snapshotService.getSnapshot(projectPath, featureId);

    if (!snapshot) {
      res.status(404).json({
        error: `No snapshot found for feature ${featureId}`,
      });
      return;
    }

    res.json({
      snapshot: {
        featureId: snapshot.featureId,
        commitHash: snapshot.commitHash,
        commitHashShort: snapshot.commitHash.slice(0, 7),
        branch: snapshot.branch,
        createdAt: snapshot.createdAt,
        status: snapshot.status,
        canRollback: snapshot.status !== 'rolled-back',
      },
    });
  } catch (error) {
    logger.error('Failed to get snapshot:', error);
    res.status(500).json({
      error: 'Failed to get snapshot',
      message: (error as Error).message,
    });
  }
}
