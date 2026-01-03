/**
 * Features routes - HTTP API for feature management
 */

import { Router } from 'express';
import { FeatureLoader } from '../../services/feature-loader.js';
import { validatePathParams } from '../../middleware/validate-paths.js';
import { createListHandler } from './routes/list.js';
import { createGetHandler } from './routes/get.js';
import { createCreateHandler } from './routes/create.js';
import { createUpdateHandler } from './routes/update.js';
import { createDeleteHandler } from './routes/delete.js';
import { createAgentOutputHandler } from './routes/agent-output.js';
import { createGenerateTitleHandler } from './routes/generate-title.js';
import { rollbackFeature } from './rollback.js';
import { getFeatureSnapshot } from './snapshot.js';
import {
  createGetDependenciesHandler,
  createUpdateDependenciesHandler,
  createGetDependencyGraphHandler,
  createDetectDependenciesHandler,
} from './dependencies.js';

export function createFeaturesRoutes(featureLoader: FeatureLoader): Router {
  const router = Router();

  router.post('/list', validatePathParams('projectPath'), createListHandler(featureLoader));
  router.post('/get', validatePathParams('projectPath'), createGetHandler(featureLoader));
  router.post('/create', validatePathParams('projectPath'), createCreateHandler(featureLoader));
  router.post('/update', validatePathParams('projectPath'), createUpdateHandler(featureLoader));
  router.post('/delete', validatePathParams('projectPath'), createDeleteHandler(featureLoader));
  router.post('/agent-output', createAgentOutputHandler(featureLoader));
  router.post('/generate-title', createGenerateTitleHandler());

  // Snapshot and rollback routes
  router.post('/rollback', validatePathParams('projectPath'), rollbackFeature);
  router.get('/:featureId/snapshot', getFeatureSnapshot);

  // Dependency management routes
  router.get('/dependencies/:featureId', createGetDependenciesHandler(featureLoader));
  router.post('/dependencies', createUpdateDependenciesHandler(featureLoader));
  router.get('/dependency-graph', createGetDependencyGraphHandler(featureLoader));
  router.post('/detect-dependencies', createDetectDependenciesHandler(featureLoader));

  return router;
}
