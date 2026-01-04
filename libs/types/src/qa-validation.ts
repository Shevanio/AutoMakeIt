/**
 * QA Validation Types
 *
 * Types for automated quality assurance validation that runs before waiting_approval.
 */

import type { AgentModel } from './model.js';

/**
 * Severity level of a QA check
 */
export type QACheckSeverity = 'critical' | 'warning' | 'info';

/**
 * Category of QA check
 */
export type QACheckCategory =
  | 'static_analysis' // Linting, type checking
  | 'semantic_analysis' // Code matches feature description
  | 'regression' // Breaking existing functionality
  | 'build' // Build process
  | 'tests'; // Test execution

/**
 * Individual QA check result
 */
export interface QACheck {
  /** Unique identifier for the check type */
  id: string;
  /** Human-readable name of the check */
  name: string;
  /** Category of the check */
  category: QACheckCategory;
  /** Whether the check passed */
  passed: boolean;
  /** Severity if failed */
  severity: QACheckSeverity;
  /** Detailed message explaining the result */
  message: string;
  /** Optional output from the check command */
  output?: string;
  /** Duration of the check in milliseconds */
  durationMs?: number;
}

/**
 * Confidence level of the overall QA validation
 */
export type QAConfidence = 'high' | 'medium' | 'low';

/**
 * Recommendation for next action based on QA results
 */
export type QARecommendation =
  | 'approve' // Safe to move to waiting_approval
  | 'auto_fix' // Attempt automatic fixes
  | 'reject' // Move back to backlog with report
  | 'manual_review'; // Requires human review

/**
 * Complete QA validation result
 */
export interface QAValidationResult {
  /** Overall pass/fail status */
  passed: boolean;
  /** Confidence in the validation result */
  confidence: QAConfidence;
  /** Individual check results */
  checks: QACheck[];
  /** Recommended next action */
  recommendation: QARecommendation;
  /** High-level summary of results */
  summary: string;
  /** Optional suggestions for improvement */
  suggestions?: string[];
  /** Total duration of all checks in milliseconds */
  totalDurationMs: number;
  /** Statistics about the checks */
  stats: {
    total: number;
    passed: number;
    failed: number;
    critical: number;
    warnings: number;
  };
}

/**
 * Stored QA validation data with metadata
 */
export interface StoredQAValidation {
  /** Feature ID that was validated */
  featureId: string;
  /** ISO timestamp when validation was performed */
  validatedAt: string;
  /** Model used for semantic validation (if any) */
  model?: AgentModel;
  /** The validation result */
  result: QAValidationResult;
  /** Version of the QA system (for future compatibility) */
  version: number;
}

/**
 * QA validation configuration
 */
export interface QAValidationConfig {
  /** Whether QA loop is enabled globally */
  enabled: boolean;
  /** Model to use for semantic validation */
  model?: AgentModel;
  /** Checks to run (if empty, run all available checks) */
  enabledChecks?: QACheckCategory[];
  /** Whether to attempt auto-fix for simple issues */
  enableAutoFix?: boolean;
  /** Maximum duration for QA validation in milliseconds */
  timeoutMs?: number;
  /** Whether to run QA in parallel with other tasks */
  runInParallel?: boolean;
}

/**
 * Events emitted during QA validation
 */
export type QAValidationEvent =
  | {
      type: 'qa_validation_start';
      featureId: string;
      projectPath: string;
      timestamp: string;
    }
  | {
      type: 'qa_validation_progress';
      featureId: string;
      projectPath: string;
      checkName: string;
      progress: number; // 0-100
      timestamp: string;
    }
  | {
      type: 'qa_validation_check_complete';
      featureId: string;
      projectPath: string;
      check: QACheck;
      timestamp: string;
    }
  | {
      type: 'qa_validation_complete';
      featureId: string;
      projectPath: string;
      result: QAValidationResult;
      timestamp: string;
    }
  | {
      type: 'qa_validation_error';
      featureId: string;
      projectPath: string;
      error: string;
      timestamp: string;
    };

/**
 * Request to run QA validation via API
 */
export interface QAValidationRequest {
  /** Absolute path to project directory */
  projectPath: string;
  /** Feature ID to validate */
  featureId: string;
  /** Optional: override working directory (e.g., worktree path) */
  workDir?: string;
  /** Optional: override QA config for this validation */
  config?: Partial<QAValidationConfig>;
}

/**
 * Response from QA validation API
 */
export interface QAValidationResponse {
  success: true;
  featureId: string;
  result: QAValidationResult;
}

/**
 * Error response from QA validation API
 */
export interface QAValidationErrorResponse {
  success: false;
  featureId: string;
  error: string;
}
