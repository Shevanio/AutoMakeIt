import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PipelineService } from '../../../src/services/pipeline-service.js';
import type { PipelineConfig, PipelineExecution } from '@automakeit/types';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

describe('pipeline-execution.ts', () => {
  let service: PipelineService;
  let testDir: string;
  let projectPath: string;

  beforeEach(async () => {
    service = new PipelineService();

    // Create temporary test directory
    testDir = path.join(os.tmpdir(), `pipeline-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
    projectPath = path.join(testDir, 'test-project');
    await fs.mkdir(projectPath, { recursive: true });
    await fs.mkdir(path.join(projectPath, '.automakeit'), { recursive: true });

    // Create a basic pipeline config
    const config: PipelineConfig = {
      version: 1,
      steps: [
        {
          id: 'step-1',
          name: 'Build',
          order: 0,
          instructions: 'Run build command',
          colorClass: 'bg-blue-500',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'step-2',
          name: 'Test',
          order: 1,
          instructions: 'Run tests',
          colorClass: 'bg-green-500',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'step-3',
          name: 'Deploy',
          order: 2,
          instructions: 'Deploy to production',
          colorClass: 'bg-purple-500',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    };

    await service.savePipelineConfig(projectPath, config);
  });

  afterEach(async () => {
    // Cleanup
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('initializeExecution', () => {
    it('should create a new pipeline execution', async () => {
      const execution = await service.initializeExecution(projectPath, 'feature-1');

      expect(execution).toBeDefined();
      expect(execution.featureId).toBe('feature-1');
      expect(execution.projectPath).toBe(projectPath);
      expect(execution.status).toBe('in_progress');
      expect(execution.currentStepIndex).toBe(0);
      expect(execution.steps).toHaveLength(3);
      expect(execution.startedAt).toBeDefined();
    });

    it('should initialize all steps as pending', async () => {
      const execution = await service.initializeExecution(projectPath, 'feature-1');

      execution.steps.forEach((step) => {
        expect(step.status).toBe('pending');
        expect(step.retryCount).toBe(0);
      });
    });

    it('should persist execution to disk', async () => {
      await service.initializeExecution(projectPath, 'feature-1');

      const retrieved = await service.getExecution(projectPath, 'feature-1');
      expect(retrieved).toBeDefined();
      expect(retrieved?.featureId).toBe('feature-1');
    });
  });

  describe('getExecution', () => {
    it('should retrieve existing execution', async () => {
      await service.initializeExecution(projectPath, 'feature-1');

      const execution = await service.getExecution(projectPath, 'feature-1');
      expect(execution).toBeDefined();
      expect(execution?.featureId).toBe('feature-1');
    });

    it('should return null for non-existent execution', async () => {
      const execution = await service.getExecution(projectPath, 'non-existent');
      expect(execution).toBeNull();
    });
  });

  describe('step status updates', () => {
    beforeEach(async () => {
      await service.initializeExecution(projectPath, 'feature-1');
    });

    describe('startStep', () => {
      it('should mark step as running', async () => {
        await service.startStep(projectPath, 'feature-1', 'step-1');

        const updated = await service.getExecution(projectPath, 'feature-1');
        const step = updated?.steps.find((s) => s.stepId === 'step-1');

        expect(step?.status).toBe('running');
        expect(step?.startedAt).toBeDefined();
      });

      it('should not set completedAt when starting', async () => {
        await service.startStep(projectPath, 'feature-1', 'step-1');

        const updated = await service.getExecution(projectPath, 'feature-1');
        const step = updated?.steps.find((s) => s.stepId === 'step-1');

        expect(step?.completedAt).toBeUndefined();
      });
    });

    describe('completeStep', () => {
      it('should mark step as success', async () => {
        await service.startStep(projectPath, 'feature-1', 'step-1');
        await service.completeStep(projectPath, 'feature-1', 'step-1');

        const updated = await service.getExecution(projectPath, 'feature-1');
        const step = updated?.steps.find((s) => s.stepId === 'step-1');

        expect(step?.status).toBe('success');
        expect(step?.completedAt).toBeDefined();
      });

      it('should store output if provided', async () => {
        const output = 'Build completed successfully\nAll tests passed';

        await service.completeStep(projectPath, 'feature-1', 'step-1', output);

        const updated = await service.getExecution(projectPath, 'feature-1');
        const step = updated?.steps.find((s) => s.stepId === 'step-1');

        expect(step?.output).toBe(output);
      });

      it('should mark execution as completed when all steps succeed', async () => {
        await service.completeStep(projectPath, 'feature-1', 'step-1');
        await service.completeStep(projectPath, 'feature-1', 'step-2');
        await service.completeStep(projectPath, 'feature-1', 'step-3');

        const updated = await service.getExecution(projectPath, 'feature-1');

        expect(updated?.status).toBe('completed');
        expect(updated?.completedAt).toBeDefined();
      });
    });

    describe('failStep', () => {
      it('should mark step as failed', async () => {
        const error = 'Build failed: missing dependency';

        await service.startStep(projectPath, 'feature-1', 'step-1');
        await service.failStep(projectPath, 'feature-1', 'step-1', error);

        const updated = await service.getExecution(projectPath, 'feature-1');
        const step = updated?.steps.find((s) => s.stepId === 'step-1');

        expect(step?.status).toBe('failed');
        expect(step?.error).toBe(error);
        expect(step?.completedAt).toBeDefined();
      });

      it('should mark execution as failed when any step fails', async () => {
        await service.failStep(projectPath, 'feature-1', 'step-1', 'Error occurred');

        const updated = await service.getExecution(projectPath, 'feature-1');

        expect(updated?.status).toBe('failed');
        expect(updated?.completedAt).toBeDefined();
      });
    });

    describe('retryStep', () => {
      it('should reset step to pending and increment retry count', async () => {
        await service.failStep(projectPath, 'feature-1', 'step-1', 'Error');

        await service.retryStep(projectPath, 'feature-1', 'step-1');

        const updated = await service.getExecution(projectPath, 'feature-1');
        const step = updated?.steps.find((s) => s.stepId === 'step-1');

        expect(step?.status).toBe('pending');
        expect(step?.retryCount).toBe(1);
        expect(step?.error).toBeUndefined();
        expect(step?.startedAt).toBeUndefined();
        expect(step?.completedAt).toBeUndefined();
      });

      it('should reset execution status to in_progress', async () => {
        await service.failStep(projectPath, 'feature-1', 'step-1', 'Error');
        await service.retryStep(projectPath, 'feature-1', 'step-1');

        const updated = await service.getExecution(projectPath, 'feature-1');

        expect(updated?.status).toBe('in_progress');
        expect(updated?.completedAt).toBeUndefined();
      });

      it('should handle multiple retries', async () => {
        await service.failStep(projectPath, 'feature-1', 'step-1', 'Error 1');
        await service.retryStep(projectPath, 'feature-1', 'step-1');

        await service.failStep(projectPath, 'feature-1', 'step-1', 'Error 2');
        await service.retryStep(projectPath, 'feature-1', 'step-1');

        const updated = await service.getExecution(projectPath, 'feature-1');
        const step = updated?.steps.find((s) => s.stepId === 'step-1');

        expect(step?.retryCount).toBe(2);
      });
    });
  });

  describe('deleteExecution', () => {
    it('should delete execution for a feature', async () => {
      await service.initializeExecution(projectPath, 'feature-1');

      await service.deleteExecution(projectPath, 'feature-1');

      const execution = await service.getExecution(projectPath, 'feature-1');
      expect(execution).toBeNull();
    });

    it('should not affect other features', async () => {
      await service.initializeExecution(projectPath, 'feature-1');
      await service.initializeExecution(projectPath, 'feature-2');

      await service.deleteExecution(projectPath, 'feature-1');

      const execution2 = await service.getExecution(projectPath, 'feature-2');
      expect(execution2).toBeDefined();
    });

    it('should handle deleting non-existent execution gracefully', async () => {
      await expect(service.deleteExecution(projectPath, 'non-existent')).resolves.not.toThrow();
    });
  });

  describe('error handling', () => {
    it('should throw error when updating non-existent execution', async () => {
      await expect(service.startStep(projectPath, 'non-existent', 'step-1')).rejects.toThrow(
        'No pipeline execution found'
      );
    });

    it('should throw error when updating non-existent step', async () => {
      await service.initializeExecution(projectPath, 'feature-1');

      await expect(
        service.startStep(projectPath, 'feature-1', 'non-existent-step')
      ).rejects.toThrow('Step non-existent-step not found');
    });
  });

  describe('complex scenarios', () => {
    it('should handle partial pipeline execution', async () => {
      await service.initializeExecution(projectPath, 'feature-1');

      // Complete first step
      await service.startStep(projectPath, 'feature-1', 'step-1');
      await service.completeStep(projectPath, 'feature-1', 'step-1', 'Build OK');

      // Fail second step
      await service.startStep(projectPath, 'feature-1', 'step-2');
      await service.failStep(projectPath, 'feature-1', 'step-2', 'Tests failed');

      const execution = await service.getExecution(projectPath, 'feature-1');

      expect(execution?.status).toBe('failed');
      expect(execution?.steps[0].status).toBe('success');
      expect(execution?.steps[1].status).toBe('failed');
      expect(execution?.steps[2].status).toBe('pending');
    });

    it('should handle successful retry flow', async () => {
      await service.initializeExecution(projectPath, 'feature-1');

      // Fail first attempt
      await service.startStep(projectPath, 'feature-1', 'step-1');
      await service.failStep(projectPath, 'feature-1', 'step-1', 'Temporary error');

      // Retry and succeed
      await service.retryStep(projectPath, 'feature-1', 'step-1');
      await service.startStep(projectPath, 'feature-1', 'step-1');
      await service.completeStep(projectPath, 'feature-1', 'step-1');

      const execution = await service.getExecution(projectPath, 'feature-1');
      const step = execution?.steps[0];

      expect(step?.status).toBe('success');
      expect(step?.retryCount).toBe(1);
      expect(step?.error).toBeUndefined();
    });
  });
});
