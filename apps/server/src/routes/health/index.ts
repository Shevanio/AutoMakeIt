/**
 * Health check routes
 *
 * NOTE: Only the basic health check (/) is unauthenticated.
 * The /detailed endpoint requires authentication.
 */

import { Router } from 'express';
import { createIndexHandler } from './routes/index.js';

/**
 * Create unauthenticated health routes (basic check only)
 * Used by load balancers and container orchestration
 */
export function createHealthRoutes(): Router {
  const router = Router();

  // Basic health check - no sensitive info
  router.get('/', createIndexHandler());

  return router;
}

// Re-export detailed handler for use in authenticated routes
export { createDetailedHandler } from './routes/detailed.js';
