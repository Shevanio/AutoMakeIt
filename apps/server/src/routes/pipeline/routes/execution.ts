/**
 * Pipeline execution routes
 * Handles runtime pipeline execution tracking and control
 */

import type { Request, Response } from 'express';
import { createLogger } from '@automakeit/utils';
import type { PipelineService } from '../../../services/pipeline-service.js';

const logger = createLogger('PipelineExecutionRoutes');

/**
 * GET /api/pipeline/execution/:featureId
 * Get pipeline execution status for a feature
 */
export function createGetExecutionHandler(pipelineService: PipelineService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { featureId } = req.params;
      const { projectPath } = req.query;

      if (!projectPath || typeof projectPath !== 'string') {
        res.status(400).json({ error: 'projectPath query parameter is required' });
        return;
      }

      const execution = await pipelineService.getExecution(projectPath, featureId);

      if (!execution) {
        res.status(404).json({ error: 'Pipeline execution not found' });
        return;
      }

      res.json(execution);
    } catch (error) {
      logger.error('Error getting pipeline execution:', error);
      res.status(500).json({ error: 'Failed to get pipeline execution' });
    }
  };
}

/**
 * POST /api/pipeline/execution/initialize
 * Initialize pipeline execution for a feature
 */
export function createInitializeExecutionHandler(pipelineService: PipelineService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, featureId } = req.body;

      if (!projectPath || !featureId) {
        res.status(400).json({ error: 'projectPath and featureId are required' });
        return;
      }

      const execution = await pipelineService.initializeExecution(projectPath, featureId);
      res.json(execution);
    } catch (error) {
      logger.error('Error initializing pipeline execution:', error);
      res.status(500).json({ error: 'Failed to initialize pipeline execution' });
    }
  };
}

/**
 * POST /api/pipeline/execution/start-step
 * Mark a pipeline step as started
 */
export function createStartStepHandler(pipelineService: PipelineService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, featureId, stepId } = req.body;

      if (!projectPath || !featureId || !stepId) {
        res.status(400).json({ error: 'projectPath, featureId, and stepId are required' });
        return;
      }

      await pipelineService.startStep(projectPath, featureId, stepId);
      res.json({ success: true });
    } catch (error) {
      logger.error('Error starting pipeline step:', error);
      res.status(500).json({ error: 'Failed to start pipeline step' });
    }
  };
}

/**
 * POST /api/pipeline/execution/complete-step
 * Mark a pipeline step as completed successfully
 */
export function createCompleteStepHandler(pipelineService: PipelineService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, featureId, stepId, output } = req.body;

      if (!projectPath || !featureId || !stepId) {
        res.status(400).json({ error: 'projectPath, featureId, and stepId are required' });
        return;
      }

      await pipelineService.completeStep(projectPath, featureId, stepId, output);
      res.json({ success: true });
    } catch (error) {
      logger.error('Error completing pipeline step:', error);
      res.status(500).json({ error: 'Failed to complete pipeline step' });
    }
  };
}

/**
 * POST /api/pipeline/execution/fail-step
 * Mark a pipeline step as failed
 */
export function createFailStepHandler(pipelineService: PipelineService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, featureId, stepId, error } = req.body;

      if (!projectPath || !featureId || !stepId || !error) {
        res.status(400).json({
          error: 'projectPath, featureId, stepId, and error are required',
        });
        return;
      }

      await pipelineService.failStep(projectPath, featureId, stepId, error);
      res.json({ success: true });
    } catch (error) {
      logger.error('Error failing pipeline step:', error);
      res.status(500).json({ error: 'Failed to fail pipeline step' });
    }
  };
}

/**
 * POST /api/pipeline/execution/retry-step
 * Retry a failed pipeline step
 */
export function createRetryStepHandler(pipelineService: PipelineService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, featureId, stepId } = req.body;

      if (!projectPath || !featureId || !stepId) {
        res.status(400).json({ error: 'projectPath, featureId, and stepId are required' });
        return;
      }

      await pipelineService.retryStep(projectPath, featureId, stepId);
      res.json({ success: true });
    } catch (error) {
      logger.error('Error retrying pipeline step:', error);
      res.status(500).json({ error: 'Failed to retry pipeline step' });
    }
  };
}

/**
 * POST /api/pipeline/execution/delete
 * Delete pipeline execution for a feature
 */
export function createDeleteExecutionHandler(pipelineService: PipelineService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, featureId } = req.body;

      if (!projectPath || !featureId) {
        res.status(400).json({ error: 'projectPath and featureId are required' });
        return;
      }

      await pipelineService.deleteExecution(projectPath, featureId);
      res.json({ success: true });
    } catch (error) {
      logger.error('Error deleting pipeline execution:', error);
      res.status(500).json({ error: 'Failed to delete pipeline execution' });
    }
  };
}
