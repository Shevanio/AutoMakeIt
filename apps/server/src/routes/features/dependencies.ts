/**
 * Dependencies API routes
 * Handles dependency detection, graph building, and management
 */

import type { Request, Response } from 'express';
import { createLogger } from '@automakeit/utils';
import type { Feature } from '@automakeit/types';
import { getDependencyService } from '../../services/dependency-service.js';
import type { FeatureLoader } from '../../services/feature-loader.js';

const logger = createLogger('DependenciesRoute');

/**
 * GET /api/features/dependencies/:featureId
 * Get dependencies for a specific feature
 */
export function createGetDependenciesHandler(featureLoader: FeatureLoader) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { featureId } = req.params;
      const { projectPath } = req.query;

      if (!projectPath || typeof projectPath !== 'string') {
        res.status(400).json({ error: 'projectPath query parameter is required' });
        return;
      }

      const dependencyService = getDependencyService();
      const allFeatures = await featureLoader.getAll(projectPath);
      const feature = allFeatures.find((f: Feature) => f.id === featureId);

      if (!feature) {
        res.status(404).json({ error: `Feature ${featureId} not found` });
        return;
      }

      const validation = dependencyService.validateDependencies(featureId, allFeatures);

      res.json({
        featureId,
        dependencies: feature.dependencies || [],
        validation,
      });
    } catch (error) {
      logger.error('Error getting dependencies:', error);
      res.status(500).json({ error: 'Failed to get dependencies' });
    }
  };
}

/**
 * POST /api/features/dependencies
 * Update dependencies for a feature (manual override)
 */
export function createUpdateDependenciesHandler(featureLoader: FeatureLoader) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, featureId, dependencies } = req.body;

      if (!projectPath || !featureId) {
        res.status(400).json({ error: 'projectPath and featureId are required' });
        return;
      }

      if (!Array.isArray(dependencies)) {
        res.status(400).json({ error: 'dependencies must be an array' });
        return;
      }

      const dependencyService = getDependencyService();
      const allFeatures = await featureLoader.getAll(projectPath);

      // Validate that all dependency IDs exist
      const invalidDeps = dependencies.filter(
        (depId) => !allFeatures.find((f: Feature) => f.id === depId)
      );

      if (invalidDeps.length > 0) {
        res.status(400).json({
          error: 'Invalid dependency IDs',
          invalid: invalidDeps,
        });
        return;
      }

      // Check for cycles
      for (const depId of dependencies) {
        if (dependencyService.wouldCreateCycle(featureId, depId, allFeatures)) {
          res.status(400).json({
            error: `Adding dependency ${depId} would create a circular dependency`,
          });
          return;
        }
      }

      // Update feature with new dependencies
      await featureLoader.update(projectPath, featureId, {
        dependencies,
      });

      logger.info(`Updated dependencies for ${featureId}:`, dependencies);

      res.json({
        success: true,
        featureId,
        dependencies,
      });
    } catch (error) {
      logger.error('Error updating dependencies:', error);
      res.status(500).json({ error: 'Failed to update dependencies' });
    }
  };
}

/**
 * GET /api/features/dependency-graph
 * Get complete dependency graph for project
 */
export function createGetDependencyGraphHandler(featureLoader: FeatureLoader) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.query;

      if (!projectPath || typeof projectPath !== 'string') {
        res.status(400).json({ error: 'projectPath query parameter is required' });
        return;
      }

      const dependencyService = getDependencyService();
      const allFeatures = await featureLoader.getAll(projectPath);
      const graph = dependencyService.buildDependencyGraph(allFeatures);

      res.json(graph);
    } catch (error) {
      logger.error('Error building dependency graph:', error);
      res.status(500).json({ error: 'Failed to build dependency graph' });
    }
  };
}

/**
 * POST /api/features/detect-dependencies
 * Auto-detect dependencies for a feature
 */
export function createDetectDependenciesHandler(featureLoader: FeatureLoader) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, featureId } = req.body;

      if (!projectPath || !featureId) {
        res.status(400).json({ error: 'projectPath and featureId are required' });
        return;
      }

      const dependencyService = getDependencyService();
      const allFeatures = await featureLoader.getAll(projectPath);
      const feature = allFeatures.find((f: Feature) => f.id === featureId);

      if (!feature) {
        res.status(404).json({ error: `Feature ${featureId} not found` });
        return;
      }

      const detected = dependencyService.detectDependencies(
        featureId,
        feature.description,
        feature.spec,
        allFeatures
      );

      res.json({
        featureId,
        detected,
        current: feature.dependencies || [],
      });
    } catch (error) {
      logger.error('Error detecting dependencies:', error);
      res.status(500).json({ error: 'Failed to detect dependencies' });
    }
  };
}
