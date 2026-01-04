/**
 * @automakeit/dependency-resolver
 * Feature dependency resolution for AutoMakeIt
 */

export {
  resolveDependencies,
  areDependenciesSatisfied,
  getBlockingDependencies,
  wouldCreateCircularDependency,
  dependencyExists,
  getAncestors,
  formatAncestorContextForPrompt,
  type DependencyResolutionResult,
  type AncestorContext,
} from './resolver.js';
