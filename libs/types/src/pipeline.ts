/**
 * Pipeline types for AutoMaker custom workflow steps
 */

export interface PipelineStep {
  id: string;
  name: string;
  order: number;
  instructions: string;
  colorClass: string;
  createdAt: string;
  updatedAt: string;
}

export interface PipelineConfig {
  version: 1;
  steps: PipelineStep[];
}

export type PipelineStatus = `pipeline_${string}`;

export type FeatureStatusWithPipeline =
  | 'backlog'
  | 'in_progress'
  | 'waiting_approval'
  | 'verified'
  | 'completed'
  | PipelineStatus;

/**
 * Execution state for a pipeline step
 */
export type PipelineStepStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped';

/**
 * Execution record for a pipeline step
 */
export interface PipelineStepExecution {
  stepId: string;
  status: PipelineStepStatus;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  retryCount: number;
  output?: string; // Optional execution output/logs
}

/**
 * Complete pipeline execution state for a feature
 */
export interface PipelineExecution {
  featureId: string;
  projectPath: string;
  status: 'not_started' | 'in_progress' | 'completed' | 'failed';
  currentStepIndex: number;
  steps: PipelineStepExecution[];
  startedAt?: string;
  completedAt?: string;
}
