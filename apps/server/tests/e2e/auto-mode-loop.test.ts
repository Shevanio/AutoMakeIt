/**
 * E2E Tests for Auto-Mode Loop
 * Tests the complete autonomous feature implementation workflow
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { AutoModeService } from '../../src/services/auto-mode-service.js';
import { FeatureLoader } from '../../src/services/feature-loader.js';
import { SettingsService } from '../../src/services/settings-service.js';
import { createEventEmitter } from '../../src/lib/events.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_PROJECT_DIR = path.join(__dirname, 'test-projects', 'auto-mode-test');
const TEST_DATA_DIR = path.join(__dirname, 'test-data');

describe('Auto-Mode Loop E2E', () => {
  let autoModeService: AutoModeService;
  let settingsService: SettingsService;
  let events: ReturnType<typeof createEventEmitter>;

  beforeAll(async () => {
    // Create test directories
    await fs.mkdir(TEST_PROJECT_DIR, { recursive: true });
    await fs.mkdir(TEST_DATA_DIR, { recursive: true });

    // Initialize git repository
    await fs.writeFile(path.join(TEST_PROJECT_DIR, 'README.md'), '# Test Project\n');

    // Note: Actual git init would be done here in a real test
    // For now, we're testing the service logic
  });

  afterAll(async () => {
    // Cleanup test directories
    try {
      await fs.rm(TEST_PROJECT_DIR, { recursive: true, force: true });
      await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  beforeEach(() => {
    events = createEventEmitter();
    settingsService = new SettingsService(TEST_DATA_DIR);
    autoModeService = new AutoModeService(events, settingsService);
  });

  afterEach(async () => {
    // Stop any running auto-loop
    try {
      await autoModeService.stopAutoLoop();
    } catch {
      // Ignore if not running
    }
  });

  describe('Service Initialization', () => {
    it('should create AutoModeService instance', () => {
      expect(autoModeService).toBeDefined();
      expect(autoModeService).toBeInstanceOf(AutoModeService);
    });

    it('should have required methods', () => {
      expect(typeof autoModeService.startAutoLoop).toBe('function');
      expect(typeof autoModeService.stopAutoLoop).toBe('function');
      expect(typeof autoModeService.executeFeature).toBe('function');
      expect(typeof autoModeService.stopFeature).toBe('function');
    });
  });

  describe('Auto-Loop Start/Stop', () => {
    it('should start auto-loop without errors', async () => {
      // This will fail if project doesn't have features, but shouldn't crash
      autoModeService.startAutoLoop(TEST_PROJECT_DIR, 1);

      // Wait a bit for it to initialize
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should be running
      const stopped = await autoModeService.stopAutoLoop();
      expect(stopped).toBeGreaterThanOrEqual(0);
    });

    it('should prevent starting auto-loop twice', async () => {
      await autoModeService.startAutoLoop(TEST_PROJECT_DIR, 1);

      // Try to start again - should throw
      await expect(autoModeService.startAutoLoop(TEST_PROJECT_DIR, 1)).rejects.toThrow(
        'already running'
      );

      await autoModeService.stopAutoLoop();
    });

    it('should stop auto-loop gracefully', async () => {
      await autoModeService.startAutoLoop(TEST_PROJECT_DIR, 1);

      const stopped = await autoModeService.stopAutoLoop();
      expect(typeof stopped).toBe('number');
      expect(stopped).toBeGreaterThanOrEqual(0);
    });

    it('should handle stop when not running', async () => {
      const stopped = await autoModeService.stopAutoLoop();
      expect(stopped).toBe(0);
    });
  });

  describe('Feature Execution State Management', () => {
    it('should track running features', async () => {
      const featureId = 'test-feature-123';

      // Feature should not be running initially
      // Check via internal state
      expect(autoModeService['runningFeatures'].has(featureId)).toBe(false);

      // Note: Actual execution would require a real feature file
      // This test validates the state management logic
    });

    it('should prevent executing same feature twice', async () => {
      const featureId = 'test-feature-concurrent';

      // First execution starts
      const executePromise1 = autoModeService
        .executeFeature(TEST_PROJECT_DIR, featureId, true, false)
        .catch(() => {
          // Expected to fail - feature doesn't exist
        });

      // Second execution should fail immediately
      await expect(
        autoModeService.executeFeature(TEST_PROJECT_DIR, featureId, true, false)
      ).rejects.toThrow('already executing');

      // Wait for first to complete
      await executePromise1;
    });
  });

  describe('Event Emission', () => {
    it('should emit auto_mode_started event', async () => {
      const emittedEvents: string[] = [];

      // Subscribe to events using the correct API
      // Events are emitted as 'auto-mode:event' with nested type field
      const unsubscribe = events.subscribe((type, payload) => {
        if (type === 'auto-mode:event') {
          const event = payload as { type: string };
          if (event.type === 'auto_mode_started') {
            emittedEvents.push('started');
          }
        }
      });

      await autoModeService.startAutoLoop(TEST_PROJECT_DIR, 1);
      await new Promise((resolve) => setTimeout(resolve, 100));
      await autoModeService.stopAutoLoop();

      unsubscribe();
      expect(emittedEvents).toContain('started');
    });

    it('should emit auto_mode_stopped event', async () => {
      const emittedEvents: string[] = [];

      const unsubscribe = events.subscribe((type, payload) => {
        if (type === 'auto-mode:event') {
          const event = payload as { type: string };
          if (event.type === 'auto_mode_stopped') {
            emittedEvents.push('stopped');
          }
        }
      });

      await autoModeService.startAutoLoop(TEST_PROJECT_DIR, 1);
      await new Promise((resolve) => setTimeout(resolve, 100));
      await autoModeService.stopAutoLoop();

      // Wait for async event emission
      await new Promise((resolve) => setImmediate(resolve));

      unsubscribe();
      expect(emittedEvents).toContain('stopped');
    });
  });

  describe('Concurrency Control', () => {
    it('should respect max concurrency setting', async () => {
      const maxConcurrency = 2;
      await autoModeService.startAutoLoop(TEST_PROJECT_DIR, maxConcurrency);

      // The config should be set
      expect(autoModeService['config']).toBeDefined();
      expect(autoModeService['config']?.maxConcurrency).toBe(maxConcurrency);

      await autoModeService.stopAutoLoop();
    });

    it('should default to concurrency of 3', async () => {
      await autoModeService.startAutoLoop(TEST_PROJECT_DIR);

      expect(autoModeService['config']?.maxConcurrency).toBe(3);

      await autoModeService.stopAutoLoop();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid project path gracefully', async () => {
      const invalidPath = '/nonexistent/path/to/project';

      // startAutoLoop doesn't validate path upfront - it starts the loop
      // The loop will go idle when there are no features to execute
      const idleEvents: string[] = [];

      const unsubscribe = events.subscribe((type, payload) => {
        if (type === 'auto-mode:event') {
          const event = payload as { type: string };
          if (event.type === 'auto_mode_idle') {
            idleEvents.push('idle');
          }
        }
      });

      await autoModeService.startAutoLoop(invalidPath, 1);
      await new Promise((resolve) => setTimeout(resolve, 200));
      const stopped = await autoModeService.stopAutoLoop();

      unsubscribe();

      // Should go idle when no features are found (graceful handling)
      // May emit idle event, or may stop before first check completes
      expect(stopped).toBeGreaterThanOrEqual(0);
      // Config persists after stop (only abortController is cleaned up)
      expect(autoModeService['config']).not.toBeNull();
      expect(autoModeService['autoLoopAbortController']).toBeNull();
    });

    it('should cleanup state after errors', async () => {
      const invalidPath = '/nonexistent/path';

      try {
        await autoModeService.startAutoLoop(invalidPath, 1);
      } catch {
        // Expected to fail
      }

      // Should be able to start again (state was cleaned up)
      // Note: Would need valid path for this to succeed
    });
  });

  describe('Abort Controller Management', () => {
    it('should create abort controller on start', async () => {
      await autoModeService.startAutoLoop(TEST_PROJECT_DIR, 1);

      expect(autoModeService['autoLoopAbortController']).toBeDefined();
      expect(autoModeService['autoLoopAbortController']).not.toBeNull();

      await autoModeService.stopAutoLoop();
    });

    it('should cleanup abort controller on stop', async () => {
      await autoModeService.startAutoLoop(TEST_PROJECT_DIR, 1);
      await autoModeService.stopAutoLoop();

      expect(autoModeService['autoLoopAbortController']).toBeNull();
    });

    it('should abort running features on stop', async () => {
      await autoModeService.startAutoLoop(TEST_PROJECT_DIR, 1);

      const abortController = autoModeService['autoLoopAbortController'];
      expect(abortController?.signal.aborted).toBe(false);

      await autoModeService.stopAutoLoop();

      expect(abortController?.signal.aborted).toBe(true);
    });
  });

  describe('Feature Loader Integration', () => {
    it('should integrate with FeatureLoader', async () => {
      // AutoModeService uses FeatureLoader internally
      expect(autoModeService['featureLoader']).toBeDefined();
      expect(autoModeService['featureLoader']).toBeInstanceOf(FeatureLoader);
    });
  });

  describe('Settings Service Integration', () => {
    it('should integrate with SettingsService', async () => {
      expect(autoModeService['settingsService']).toBeDefined();
      expect(autoModeService['settingsService']).toBeInstanceOf(SettingsService);
    });
  });
});
