/**
 * DependencyService
 * Manages feature dependencies, builds dependency graphs, and provides execution ordering
 */

import { createLogger } from '@automakeit/utils';
import type { Feature, DependencyGraph, DependencyNode } from '@automakeit/types';

const logger = createLogger('DependencyService');

export class DependencyService {
  /**
   * Detect potential dependencies from feature description and spec
   * Looks for feature ID references in the format: feature-xxx or #xxx
   */
  detectDependencies(
    featureId: string,
    description: string,
    spec: string | undefined,
    allFeatures: Feature[]
  ): string[] {
    const dependencies = new Set<string>();
    const text = `${description} ${spec || ''}`.toLowerCase();

    // Create map of feature IDs and titles for matching
    const featureMap = new Map<string, string>();
    allFeatures.forEach((f) => {
      if (f.id !== featureId) {
        featureMap.set(f.id.toLowerCase(), f.id);
        if (f.title) {
          featureMap.set(f.title.toLowerCase(), f.id);
        }
      }
    });

    // Pattern 1: Direct feature ID references (feature-xxx)
    const featureIdPattern = /feature-[a-z0-9-]+/gi;
    const matches = text.match(featureIdPattern);
    if (matches) {
      matches.forEach((match) => {
        const normalizedMatch = match.toLowerCase();
        const actualId = featureMap.get(normalizedMatch);
        if (actualId) {
          dependencies.add(actualId);
        }
      });
    }

    // Pattern 2: Hash references (#xxx)
    const hashPattern = /#([a-z0-9-]+)/gi;
    const hashMatches = text.match(hashPattern);
    if (hashMatches) {
      hashMatches.forEach((match) => {
        const idPart = match.substring(1).toLowerCase(); // Remove #
        const actualId = featureMap.get(`feature-${idPart}`);
        if (actualId) {
          dependencies.add(actualId);
        }
      });
    }

    // Pattern 3: "depends on" or "requires" followed by feature reference or title
    const keywords = ['depends on', 'requires', 'needs', 'after'];
    keywords.forEach((keyword) => {
      const idx = text.indexOf(keyword);
      if (idx !== -1) {
        // Extract text after the keyword until next sentence/comma
        const afterKeyword = text.substring(idx + keyword.length).trim();
        const endMatch = afterKeyword.match(
          /^(the\s+)?([a-z0-9\s-]+?)(\s+(feature|to be|before)|\.| to |,|$)/i
        );

        if (endMatch) {
          const refText = endMatch[2].trim().toLowerCase();

          // Try direct ID match
          let actualId = featureMap.get(refText);

          // Try with "feature-" prefix
          if (!actualId) {
            actualId = featureMap.get(`feature-${refText}`);
          }

          // Try matching as title (for multi-word titles)
          if (!actualId) {
            actualId = featureMap.get(refText);
          }

          if (actualId) {
            dependencies.add(actualId);
          }
        }
      }
    });

    const result = Array.from(dependencies);
    if (result.length > 0) {
      logger.info(`Detected ${result.length} dependencies for ${featureId}: ${result.join(', ')}`);
    }

    return result;
  }

  /**
   * Build complete dependency graph for all features
   */
  buildDependencyGraph(features: Feature[]): DependencyGraph {
    const nodes: Record<string, DependencyNode> = {};

    // Initialize nodes
    features.forEach((feature) => {
      nodes[feature.id] = {
        featureId: feature.id,
        title: feature.title,
        status: feature.status,
        dependencies: feature.dependencies || [],
        dependents: [],
      };
    });

    // Build dependents (reverse dependencies)
    Object.values(nodes).forEach((node) => {
      node.dependencies.forEach((depId: string) => {
        if (nodes[depId]) {
          nodes[depId].dependents.push(node.featureId);
        }
      });
    });

    // Detect cycles and get execution order
    const { order, cycles } = this.topologicalSort(nodes);

    return {
      nodes,
      executionOrder: order,
      hasCycles: cycles.length > 0,
      cycles: cycles.length > 0 ? cycles : undefined,
    };
  }

  /**
   * Get execution order for a subset of features respecting dependencies
   * Returns features in the order they should be executed
   */
  getExecutionOrder(featureIds: string[], allFeatures: Feature[]): string[] {
    const graph = this.buildDependencyGraph(allFeatures);
    const selectedSet = new Set(featureIds);

    // Filter execution order to only include selected features
    // but keep the dependency-respecting order
    return graph.executionOrder.filter((id) => selectedSet.has(id));
  }

  /**
   * Validate that a feature's dependencies are satisfied
   * Returns list of unsatisfied dependencies
   */
  validateDependencies(
    featureId: string,
    allFeatures: Feature[]
  ): {
    satisfied: boolean;
    unsatisfied: string[];
    missing: string[];
  } {
    const feature = allFeatures.find((f) => f.id === featureId);
    if (!feature || !feature.dependencies || feature.dependencies.length === 0) {
      return { satisfied: true, unsatisfied: [], missing: [] };
    }

    const unsatisfied: string[] = [];
    const missing: string[] = [];

    feature.dependencies.forEach((depId) => {
      const depFeature = allFeatures.find((f) => f.id === depId);

      if (!depFeature) {
        missing.push(depId);
        return;
      }

      // Dependency is satisfied if completed or verified
      if (depFeature.status !== 'completed' && depFeature.status !== 'verified') {
        unsatisfied.push(depId);
      }
    });

    return {
      satisfied: unsatisfied.length === 0 && missing.length === 0,
      unsatisfied,
      missing,
    };
  }

  /**
   * Topological sort using Kahn's algorithm
   * Returns execution order and detected cycles
   */
  private topologicalSort(nodes: Record<string, DependencyNode>): {
    order: string[];
    cycles: string[][];
  } {
    const order: string[] = [];
    const cycles: string[][] = [];

    // Calculate in-degree for each node
    const inDegree = new Map<string, number>();
    const adjList = new Map<string, string[]>();

    Object.keys(nodes).forEach((id: string) => {
      inDegree.set(id, 0);
      adjList.set(id, []);
    });

    Object.values(nodes).forEach((node) => {
      node.dependencies.forEach((depId: string) => {
        if (nodes[depId]) {
          inDegree.set(node.featureId, (inDegree.get(node.featureId) || 0) + 1);
          adjList.get(depId)?.push(node.featureId);
        }
      });
    });

    // Queue of nodes with no dependencies
    const queue: string[] = [];
    inDegree.forEach((degree, id) => {
      if (degree === 0) {
        queue.push(id);
      }
    });

    // Process queue
    while (queue.length > 0) {
      const current = queue.shift()!;
      order.push(current);

      adjList.get(current)?.forEach((dependent) => {
        const newDegree = (inDegree.get(dependent) || 0) - 1;
        inDegree.set(dependent, newDegree);

        if (newDegree === 0) {
          queue.push(dependent);
        }
      });
    }

    // If not all nodes processed, we have cycles
    if (order.length !== Object.keys(nodes).length) {
      const remaining = Object.keys(nodes).filter((id) => !order.includes(id));
      cycles.push(...this.detectCycles(nodes, remaining));
    }

    return { order, cycles };
  }

  /**
   * Detect circular dependencies using DFS
   */
  private detectCycles(nodes: Record<string, DependencyNode>, candidates: string[]): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (nodeId: string, path: string[]): void => {
      visited.add(nodeId);
      recursionStack.add(nodeId);
      path.push(nodeId);

      const node = nodes[nodeId];
      if (node) {
        for (const depId of node.dependencies) {
          if (!visited.has(depId)) {
            dfs(depId, [...path]);
          } else if (recursionStack.has(depId)) {
            // Found a cycle
            const cycleStart = path.indexOf(depId);
            const cycle = path.slice(cycleStart);
            cycle.push(depId); // Close the cycle
            cycles.push(cycle);
          }
        }
      }

      recursionStack.delete(nodeId);
    };

    candidates.forEach((nodeId) => {
      if (!visited.has(nodeId)) {
        dfs(nodeId, []);
      }
    });

    return cycles;
  }

  /**
   * Check if adding a dependency would create a cycle
   */
  wouldCreateCycle(featureId: string, newDependency: string, allFeatures: Feature[]): boolean {
    // Create temporary feature set with the new dependency
    const tempFeatures = allFeatures.map((f) =>
      f.id === featureId ? { ...f, dependencies: [...(f.dependencies || []), newDependency] } : f
    );

    const graph = this.buildDependencyGraph(tempFeatures);
    return graph.hasCycles;
  }
}

// Singleton instance
let instance: DependencyService | null = null;

export function getDependencyService(): DependencyService {
  if (!instance) {
    instance = new DependencyService();
  }
  return instance;
}
