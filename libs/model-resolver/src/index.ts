/**
 * @automakeit/model-resolver
 * Model resolution utilities for AutoMakeIt
 */

// Re-export constants from types
export { CLAUDE_MODEL_MAP, DEFAULT_MODELS, type ModelAlias } from '@automakeit/types';

// Export resolver functions
export { resolveModelString, getEffectiveModel } from './resolver.js';
