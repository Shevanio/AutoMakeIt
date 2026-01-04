/**
 * QA Validation Routes
 *
 * API endpoints for QA validation reports
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { QAService } from '../../services/qa-service.js';
import type { EventEmitter } from '../../lib/events.js';
import type { SettingsService } from '../../services/settings-service.js';
import { createLogger } from '@automakeit/utils';
import type {
  QAValidationRequest,
  QAValidationResponse,
  QAValidationErrorResponse,
} from '@automakeit/types';

const logger = createLogger('QA Routes');

export function createQARoutes(events: EventEmitter, settingsService: SettingsService): Router {
  const router = Router();
  const qaService = new QAService(events, settingsService);

  /**
   * GET /qa/report/:featureId
   * Get stored QA validation report for a feature
   */
  router.get('/report/:featureId', async (req: Request, res: Response) => {
    try {
      const { featureId } = req.params;
      const { projectPath } = req.query;

      if (!projectPath || typeof projectPath !== 'string') {
        res.status(400).json({
          success: false,
          error: 'projectPath query parameter is required',
        });
        return;
      }

      const validation = await qaService.readValidation(projectPath, featureId);

      if (!validation) {
        res.status(404).json({
          success: false,
          featureId,
          error: 'QA validation report not found',
        } as QAValidationErrorResponse);
        return;
      }

      res.json({
        success: true,
        featureId,
        result: validation.result,
      } as QAValidationResponse);
    } catch (error) {
      logger.error('Failed to get QA report:', error);
      res.status(500).json({
        success: false,
        featureId: req.params.featureId,
        error: (error as Error).message,
      } as QAValidationErrorResponse);
    }
  });

  /**
   * POST /qa/validate
   * Manually trigger QA validation for a feature
   */
  router.post('/validate', async (req: Request, res: Response) => {
    try {
      const { projectPath, featureId, workDir, config } = req.body as QAValidationRequest;

      if (!projectPath || !featureId) {
        res.status(400).json({
          success: false,
          error: 'projectPath and featureId are required',
        });
        return;
      }

      // Load feature from disk
      const { getFeatureDir } = await import('@automakeit/platform');
      const secureFs = await import('../../lib/secure-fs.js');
      const featureDir = getFeatureDir(projectPath, featureId);
      const featurePath = `${featureDir}/feature.json`;

      let feature;
      try {
        const content = (await secureFs.readFile(featurePath, 'utf-8')) as string;
        feature = JSON.parse(content);
      } catch (error) {
        res.status(404).json({
          success: false,
          featureId,
          error: 'Feature not found',
        } as QAValidationErrorResponse);
        return;
      }

      // Run validation
      const result = await qaService.validateFeature(
        projectPath,
        featureId,
        feature,
        workDir,
        config
      );

      res.json({
        success: true,
        featureId,
        result,
      } as QAValidationResponse);
    } catch (error) {
      logger.error('QA validation failed:', error);
      res.status(500).json({
        success: false,
        featureId: req.body.featureId,
        error: (error as Error).message,
      } as QAValidationErrorResponse);
    }
  });

  return router;
}
