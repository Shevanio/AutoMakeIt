/**
 * Multi-Agent Spec Generation Routes
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { MultiAgentSpecService } from '../../services/multi-agent-spec-service.js';
import { ClaudeProvider } from '../../providers/claude-provider.js';
import { FeatureLoader } from '../../services/feature-loader.js';
import { createLogger } from '@automakeit/utils';
import type { MultiAgentAnalysisRequest } from '@automakeit/types';
import type { EventEmitter } from '../../lib/events.js';

const logger = createLogger('MultiAgentSpecRoute');

/**
 * Factory function to create multi-agent spec routes with event emitter
 */
export function createMultiAgentSpecRoutes(events: EventEmitter) {
  const router = Router();

  /**
   * POST /api/spec/multi-agent-analyze
   *
   * Analyzes a feature using multiple specialized AI agents
   *
   * Request body:
   * {
   *   featureId: string,
   *   projectPath: string,
   *   agents?: AgentSpecialization[],  // Optional: specific agents to use
   *   model?: string,                   // Optional: override default model
   *   parallel?: boolean                // Optional: run in parallel (default: true)
   * }
   */
  router.post('/multi-agent-analyze', async (req: Request, res: Response) => {
    const { featureId, projectPath, agents, model, parallel, description } = req.body;

    // Validate required fields
    if (!projectPath) {
      return res.status(400).json({
        success: false,
        error: 'projectPath is required',
      });
    }

    // Either featureId or description is required
    if (!featureId && !description) {
      return res.status(400).json({
        success: false,
        error: 'Either featureId or description is required',
      });
    }

    logger.info(
      featureId
        ? `Starting multi-agent analysis for feature: ${featureId}`
        : 'Starting multi-agent analysis for app spec'
    );

    try {
      let feature;

      if (featureId) {
        // Load existing feature
        const featureLoader = new FeatureLoader();
        feature = await featureLoader.get(projectPath, featureId);

        if (!feature) {
          return res.status(404).json({
            success: false,
            error: `Feature ${featureId} not found`,
          });
        }
      } else {
        // Create temporary feature from description (for app spec analysis)
        feature = {
          id: 'app-spec-analysis',
          title: 'App Specification Analysis',
          description: description || 'Analyze the complete application specification',
          status: 'backlog' as const,
          steps: [],
          category: 'feature',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }

      // Emit started event
      events.emit('multi-agent:started', {
        featureId,
        projectPath,
        agentsCount: agents?.length || 6,
        timestamp: new Date().toISOString(),
      });

      // Create service and run analysis
      const claudeProvider = new ClaudeProvider();
      const multiAgentService = new MultiAgentSpecService(claudeProvider);

      const request: Partial<MultiAgentAnalysisRequest> = {
        agents,
        model,
        parallel,
      };

      // Run analysis
      const analysis = await multiAgentService.analyzeFeature(feature, projectPath, request);

      // Emit completed event
      events.emit('multi-agent:completed', {
        featureId,
        projectPath,
        totalSteps: analysis.combined_steps.length,
        totalDurationMins: analysis.metadata.total_duration_mins,
        complexityScore: analysis.metadata.complexity_score,
        riskLevel: analysis.metadata.risk_level,
        successfulAgents: analysis.metadata.successful_agents,
        failedAgents: analysis.metadata.failed_agents,
        timestamp: new Date().toISOString(),
      });

      logger.info(
        `Multi-agent analysis completed: ${analysis.combined_steps.length} steps, ${analysis.metadata.total_duration_mins}min estimated`
      );

      // Return analysis result in expected format
      res.json({
        success: true,
        analysis,
      });
    } catch (error: any) {
      logger.error('Multi-agent analysis failed:', error);

      // Emit error event
      events.emit('multi-agent:error', {
        featureId,
        projectPath,
        error: error.message,
        timestamp: new Date().toISOString(),
      });

      res.status(500).json({
        success: false,
        error: error.message || 'Multi-agent analysis failed',
      });
    }
  });

  /**
   * GET /api/spec/multi-agent-status/:featureId
   *
   * Gets the status of an ongoing multi-agent analysis
   * (Future: could track progress in-memory or Redis)
   */
  router.get('/multi-agent-status/:featureId', async (req: Request, res: Response) => {
    const { featureId } = req.params;

    // For now, return a simple status
    // TODO: Implement actual progress tracking
    res.json({
      featureId,
      status: 'unknown',
      message: 'Progress tracking not yet implemented',
    });
  });

  /**
   * POST /api/spec/save-improvements
   *
   * Saves improvement proposals to .automakeit/improvements.md
   *
   * Request body:
   * {
   *   projectPath: string,
   *   content: string
   * }
   */
  router.post('/save-improvements', async (req: Request, res: Response) => {
    const { projectPath, content } = req.body;

    if (!projectPath || !content) {
      return res.status(400).json({
        success: false,
        error: 'projectPath and content are required',
      });
    }

    try {
      const { ensureAutoMakeItDir } = await import('@automakeit/platform');
      const fs = await import('fs/promises');
      const path = await import('path');

      // Ensure .automakeit directory exists
      const automakeitDir = await ensureAutoMakeItDir(projectPath);

      // Write improvements.md
      const improvementsPath = path.join(automakeitDir, 'improvements.md');
      await fs.writeFile(improvementsPath, content, 'utf-8');

      logger.info(`Saved improvements to ${improvementsPath}`);

      res.json({
        success: true,
        path: improvementsPath,
      });
    } catch (error: any) {
      logger.error('Failed to save improvements:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to save improvements',
      });
    }
  });
  return router;
}

// Export default for backwards compatibility
export default function (events: EventEmitter) {
  return createMultiAgentSpecRoutes(events);
}
