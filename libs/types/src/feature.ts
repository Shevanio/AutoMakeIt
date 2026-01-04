/**
 * Feature types for AutoMakeIt feature management
 */

import type { PlanningMode } from './settings.js';

export interface FeatureImagePath {
  id: string;
  path: string;
  filename: string;
  mimeType: string;
  [key: string]: unknown;
}

export interface FeatureTextFilePath {
  id: string;
  path: string;
  filename: string;
  mimeType: string;
  content: string; // Text content of the file
  [key: string]: unknown;
}

export interface Feature {
  id: string;
  title?: string;
  titleGenerating?: boolean;
  category: string;
  description: string;
  passes?: boolean;
  priority?: number;
  status?: FeatureStatus;
  dependencies?: string[];
  spec?: string;
  model?: string;
  imagePaths?: Array<string | FeatureImagePath | { path: string; [key: string]: unknown }>;
  textFilePaths?: FeatureTextFilePath[];
  // Branch info - worktree path is derived at runtime from branchName
  branchName?: string; // Name of the feature branch (undefined = use current worktree)
  skipTests?: boolean;
  thinkingLevel?: string;
  aiProfileId?: string; // ID of the AI profile to use (if any)
  planningMode?: PlanningMode;
  requirePlanApproval?: boolean;
  planSpec?: {
    status: 'pending' | 'generating' | 'generated' | 'approved' | 'rejected';
    content?: string;
    version: number;
    generatedAt?: string;
    approvedAt?: string;
    reviewedByUser: boolean;
    tasksCompleted?: number;
    tasksTotal?: number;
  };
  error?: string;
  summary?: string;
  startedAt?: string;
  [key: string]: unknown; // Keep catch-all for extensibility
}

/**
 * Feature status enum
 * Represents all possible states a feature can be in throughout its lifecycle
 */
export type FeatureStatus =
  | 'pending' // Initial state, not yet started
  | 'ready' // Dependencies satisfied, ready to execute
  | 'backlog' // Moved back to backlog (failed or cancelled)
  | 'in_progress' // Currently being implemented
  | 'waiting_approval' // Awaiting manual verification/approval
  | 'verified' // Automated verification passed
  | 'completed' // Successfully completed
  | 'failed'; // Failed during execution

/**
 * Dependency graph node representing a feature and its relationships
 */
export interface DependencyNode {
  featureId: string;
  title?: string;
  status?: FeatureStatus;
  dependencies: string[]; // Features this node depends on
  dependents: string[]; // Features that depend on this node
}

/**
 * Complete dependency graph for a project
 */
export interface DependencyGraph {
  nodes: Record<string, DependencyNode>;
  executionOrder: string[]; // Topologically sorted feature IDs
  hasCycles: boolean;
  cycles?: string[][]; // Detected circular dependencies
}
