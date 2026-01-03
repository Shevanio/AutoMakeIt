import { describe, it, expect, beforeEach } from 'vitest';
import { DependencyService } from '../../../src/services/dependency-service.js';
import type { Feature } from '@automakeit/types';

describe('dependency-service.ts', () => {
  let service: DependencyService;
  let testFeatures: Feature[];

  beforeEach(() => {
    service = new DependencyService();

    // Create test features
    testFeatures = [
      {
        id: 'feature-auth',
        title: 'Authentication System',
        category: 'todo',
        description: 'Implement user authentication',
        status: 'completed',
      },
      {
        id: 'feature-api',
        title: 'API Layer',
        category: 'todo',
        description: 'Create API endpoints that require feature-auth',
        status: 'in_progress',
        dependencies: ['feature-auth'],
      },
      {
        id: 'feature-ui',
        title: 'User Interface',
        category: 'todo',
        description: 'Build UI that depends on #api',
        status: 'pending',
      },
      {
        id: 'feature-tests',
        title: 'Test Suite',
        category: 'todo',
        description: 'Tests for all features',
        status: 'pending',
        dependencies: ['feature-auth', 'feature-api', 'feature-ui'],
      },
    ];
  });

  describe('detectDependencies', () => {
    it('should detect direct feature ID references', () => {
      const deps = service.detectDependencies(
        'feature-ui',
        'Depends on feature-auth and feature-api',
        undefined,
        testFeatures
      );

      expect(deps).toContain('feature-auth');
      expect(deps).toContain('feature-api');
    });

    it('should detect hash references', () => {
      const deps = service.detectDependencies(
        'feature-ui',
        'Requires #auth before implementation',
        undefined,
        testFeatures
      );

      expect(deps).toContain('feature-auth');
    });

    it('should detect "depends on" patterns with full feature ID', () => {
      const deps = service.detectDependencies(
        'feature-new',
        'This depends on feature-auth to work',
        undefined,
        testFeatures
      );

      expect(deps).toContain('feature-auth');
    });

    it('should detect dependencies in spec', () => {
      const deps = service.detectDependencies(
        'feature-new',
        'New feature',
        'Implementation should use feature-auth',
        testFeatures
      );

      expect(deps).toContain('feature-auth');
    });

    it('should not include itself as dependency', () => {
      const deps = service.detectDependencies(
        'feature-auth',
        'feature-auth implementation',
        undefined,
        testFeatures
      );

      expect(deps).not.toContain('feature-auth');
    });

    it('should return empty array if no dependencies found', () => {
      const deps = service.detectDependencies(
        'feature-new',
        'Standalone feature with no dependencies',
        undefined,
        testFeatures
      );

      expect(deps).toEqual([]);
    });

    it('should handle case-insensitive matching', () => {
      const deps = service.detectDependencies(
        'feature-new',
        'Depends on FEATURE-AUTH',
        undefined,
        testFeatures
      );

      expect(deps).toContain('feature-auth');
    });

    it('should detect dependencies by title', () => {
      const deps = service.detectDependencies(
        'feature-new',
        'Requires Authentication System to be complete',
        undefined,
        testFeatures
      );

      expect(deps).toContain('feature-auth');
    });

    it('should not duplicate dependencies', () => {
      const deps = service.detectDependencies(
        'feature-new',
        'Depends on feature-auth and requires #auth',
        undefined,
        testFeatures
      );

      expect(deps).toEqual(['feature-auth']);
    });
  });

  describe('buildDependencyGraph', () => {
    it('should build nodes for all features', () => {
      const graph = service.buildDependencyGraph(testFeatures);

      expect(Object.keys(graph.nodes)).toHaveLength(4);
      expect(graph.nodes['feature-auth']).toBeDefined();
      expect(graph.nodes['feature-api']).toBeDefined();
      expect(graph.nodes['feature-ui']).toBeDefined();
      expect(graph.nodes['feature-tests']).toBeDefined();
    });

    it('should populate dependencies correctly', () => {
      const graph = service.buildDependencyGraph(testFeatures);

      expect(graph.nodes['feature-auth'].dependencies).toEqual([]);
      expect(graph.nodes['feature-api'].dependencies).toEqual(['feature-auth']);
      expect(graph.nodes['feature-tests'].dependencies).toEqual([
        'feature-auth',
        'feature-api',
        'feature-ui',
      ]);
    });

    it('should populate dependents correctly', () => {
      const graph = service.buildDependencyGraph(testFeatures);

      expect(graph.nodes['feature-auth'].dependents).toContain('feature-api');
      expect(graph.nodes['feature-auth'].dependents).toContain('feature-tests');
      expect(graph.nodes['feature-api'].dependents).toContain('feature-tests');
    });

    it('should provide execution order', () => {
      const graph = service.buildDependencyGraph(testFeatures);

      expect(graph.executionOrder).toBeDefined();
      expect(graph.executionOrder).toHaveLength(4);

      // feature-auth must come before feature-api
      const authIndex = graph.executionOrder.indexOf('feature-auth');
      const apiIndex = graph.executionOrder.indexOf('feature-api');
      expect(authIndex).toBeLessThan(apiIndex);

      // feature-tests must be last
      const testsIndex = graph.executionOrder.indexOf('feature-tests');
      expect(testsIndex).toBe(3);
    });

    it('should detect no cycles in valid graph', () => {
      const graph = service.buildDependencyGraph(testFeatures);

      expect(graph.hasCycles).toBe(false);
      expect(graph.cycles).toBeUndefined();
    });

    it('should detect circular dependencies', () => {
      const cyclicFeatures: Feature[] = [
        {
          id: 'feature-a',
          category: 'todo',
          description: 'Feature A',
          dependencies: ['feature-b'],
        },
        {
          id: 'feature-b',
          category: 'todo',
          description: 'Feature B',
          dependencies: ['feature-c'],
        },
        {
          id: 'feature-c',
          category: 'todo',
          description: 'Feature C',
          dependencies: ['feature-a'], // Circular: c -> a -> b -> c
        },
      ];

      const graph = service.buildDependencyGraph(cyclicFeatures);

      expect(graph.hasCycles).toBe(true);
      expect(graph.cycles).toBeDefined();
      expect(graph.cycles!.length).toBeGreaterThan(0);
    });
  });

  describe('getExecutionOrder', () => {
    it('should return features in dependency order', () => {
      const order = service.getExecutionOrder(
        ['feature-tests', 'feature-api', 'feature-auth'],
        testFeatures
      );

      expect(order).toHaveLength(3);

      // feature-auth must come before feature-api
      const authIndex = order.indexOf('feature-auth');
      const apiIndex = order.indexOf('feature-api');
      expect(authIndex).toBeLessThan(apiIndex);

      // feature-tests must be last
      expect(order[2]).toBe('feature-tests');
    });

    it('should only include selected features', () => {
      const order = service.getExecutionOrder(['feature-auth', 'feature-api'], testFeatures);

      expect(order).toHaveLength(2);
      expect(order).not.toContain('feature-ui');
      expect(order).not.toContain('feature-tests');
    });

    it('should handle single feature', () => {
      const order = service.getExecutionOrder(['feature-auth'], testFeatures);

      expect(order).toEqual(['feature-auth']);
    });
  });

  describe('validateDependencies', () => {
    it('should return satisfied for feature with no dependencies', () => {
      const result = service.validateDependencies('feature-auth', testFeatures);

      expect(result.satisfied).toBe(true);
      expect(result.unsatisfied).toEqual([]);
      expect(result.missing).toEqual([]);
    });

    it('should return satisfied if all dependencies are completed', () => {
      const result = service.validateDependencies('feature-api', testFeatures);

      expect(result.satisfied).toBe(true);
      expect(result.unsatisfied).toEqual([]);
      expect(result.missing).toEqual([]);
    });

    it('should return unsatisfied if dependencies are not completed', () => {
      const result = service.validateDependencies('feature-tests', testFeatures);

      expect(result.satisfied).toBe(false);
      expect(result.unsatisfied).toContain('feature-api'); // in_progress
      expect(result.unsatisfied).toContain('feature-ui'); // pending
    });

    it('should detect missing dependencies', () => {
      const featuresWithMissing: Feature[] = [
        {
          id: 'feature-broken',
          category: 'todo',
          description: 'Broken feature',
          dependencies: ['feature-nonexistent'],
        },
      ];

      const result = service.validateDependencies('feature-broken', featuresWithMissing);

      expect(result.satisfied).toBe(false);
      expect(result.missing).toContain('feature-nonexistent');
    });

    it('should accept verified status as satisfied', () => {
      const featuresWithVerified: Feature[] = [
        {
          id: 'feature-dep',
          category: 'todo',
          description: 'Dependency',
          status: 'verified',
        },
        {
          id: 'feature-main',
          category: 'todo',
          description: 'Main feature',
          dependencies: ['feature-dep'],
        },
      ];

      const result = service.validateDependencies('feature-main', featuresWithVerified);

      expect(result.satisfied).toBe(true);
    });
  });

  describe('wouldCreateCycle', () => {
    it('should return false for valid dependency', () => {
      const wouldCycle = service.wouldCreateCycle('feature-ui', 'feature-auth', testFeatures);

      expect(wouldCycle).toBe(false);
    });

    it('should return true if adding dependency creates cycle', () => {
      // feature-auth -> feature-api -> feature-tests
      // Adding feature-tests -> feature-auth would create cycle
      const wouldCycle = service.wouldCreateCycle('feature-auth', 'feature-tests', testFeatures);

      expect(wouldCycle).toBe(true);
    });

    it('should return true for self-dependency', () => {
      const wouldCycle = service.wouldCreateCycle('feature-auth', 'feature-auth', testFeatures);

      expect(wouldCycle).toBe(true);
    });

    it('should detect indirect cycles', () => {
      // feature-tests depends on feature-api
      // feature-api depends on feature-auth
      // Adding feature-auth -> feature-tests would create indirect cycle
      const wouldCycle = service.wouldCreateCycle('feature-auth', 'feature-tests', testFeatures);

      expect(wouldCycle).toBe(true);
    });
  });
});
