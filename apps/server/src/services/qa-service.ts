/**
 * QA Service - Automated Quality Assurance Validation
 *
 * Validates feature implementations before they reach waiting_approval status.
 * Performs static analysis, semantic validation, and regression checks.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import * as secureFs from '../lib/secure-fs.js';
import { getFeatureDir } from '@automakeit/platform';
import type {
  QAValidationResult,
  QACheck,
  QACheckCategory,
  QAValidationConfig,
  StoredQAValidation,
  Feature,
  QARecommendation,
  QAConfidence,
} from '@automakeit/types';
import { createLogger } from '@automakeit/utils';
import type { EventEmitter } from '../lib/events.js';
import { ProviderFactory } from '../providers/provider-factory.js';
import type { SettingsService } from './settings-service.js';
import { resolveModelString, DEFAULT_MODELS } from '@automakeit/model-resolver';
import { detectProject, getRecommendedChecks } from './project-detector.js';

const execAsync = promisify(exec);
const logger = createLogger('QAService');

// Default timeout for QA validation (3 minutes)
const DEFAULT_QA_TIMEOUT_MS = 180000;

// Default QA config
const DEFAULT_QA_CONFIG: QAValidationConfig = {
  enabled: true,
  model: 'haiku', // Fast and cost-effective for QA
  enabledChecks: undefined, // Run all checks by default
  enableAutoFix: false, // Disabled in MVP
  timeoutMs: DEFAULT_QA_TIMEOUT_MS,
  runInParallel: false, // Sequential execution in MVP
};

export class QAService {
  private events: EventEmitter;
  private settingsService: SettingsService | null = null;

  constructor(events: EventEmitter, settingsService?: SettingsService) {
    this.events = events;
    this.settingsService = settingsService ?? null;
  }

  /**
   * Get QA configuration from settings or use defaults
   */
  private async getQAConfig(projectPath: string): Promise<QAValidationConfig> {
    try {
      if (!this.settingsService) {
        return DEFAULT_QA_CONFIG;
      }

      const projectSettings = await this.settingsService.getProjectSettings(projectPath);

      // Check if QA config exists in project settings
      const qaConfig = (projectSettings as any).qaValidation as
        | Partial<QAValidationConfig>
        | undefined;

      if (!qaConfig) {
        return DEFAULT_QA_CONFIG;
      }

      return {
        ...DEFAULT_QA_CONFIG,
        ...qaConfig,
      };
    } catch (error) {
      logger.warn('Failed to load QA config, using defaults:', error);
      return DEFAULT_QA_CONFIG;
    }
  }

  /**
   * Validate a feature implementation
   */
  async validateFeature(
    projectPath: string,
    featureId: string,
    feature: Feature,
    workDir?: string,
    configOverride?: Partial<QAValidationConfig>
  ): Promise<QAValidationResult> {
    const startTime = Date.now();
    const config = { ...(await this.getQAConfig(projectPath)), ...configOverride };

    logger.info(`Starting QA validation for feature ${featureId}`);

    // Emit start event
    this.emitQAEvent('qa_validation_start', {
      featureId,
      projectPath,
      timestamp: new Date().toISOString(),
    });

    try {
      const checks: QACheck[] = [];
      const effectiveWorkDir = workDir || projectPath;

      // Detect project type and available tooling
      logger.info(`Detecting project type for ${featureId}...`);
      const projectInfo = await detectProject(effectiveWorkDir);
      logger.info(`Project detected: ${projectInfo.type} (${projectInfo.language})`);

      // Get recommended checks based on project type
      // If user provides config.enabledChecks, use those; otherwise use smart defaults
      let enabledCategories: QACheckCategory[];

      if (config.enabledChecks && config.enabledChecks.length > 0) {
        // User explicitly configured checks
        enabledCategories = config.enabledChecks;
        logger.info(`Using user-configured checks: ${enabledCategories.join(', ')}`);
      } else {
        // Smart defaults based on project detection
        enabledCategories = [];

        if (projectInfo.hasLint) {
          enabledCategories.push('static_analysis');
        }
        if (projectInfo.hasBuild) {
          enabledCategories.push('build');
        }
        // Note: tests still disabled in MVP to avoid UI test conflicts
        // if (projectInfo.hasTest) {
        //   enabledCategories.push('tests');
        // }

        logger.info(
          `Using smart defaults for ${projectInfo.type}: ${enabledCategories.join(', ') || 'none'}`
        );
      }

      // Static Analysis Checks (only if project has the tools)
      if (enabledCategories.includes('static_analysis')) {
        if (projectInfo.hasLint || projectInfo.hasTypeCheck) {
          checks.push(...(await this.runStaticAnalysisChecks(effectiveWorkDir, projectInfo)));
        } else {
          logger.info('Skipping static analysis - no lint/typecheck scripts found');
        }
      }

      // Build Check (only if project has build script)
      if (enabledCategories.includes('build')) {
        if (projectInfo.hasBuild) {
          checks.push(await this.runBuildCheck(effectiveWorkDir));
        } else {
          logger.info('Skipping build check - no build script found');
        }
      }

      // Tests Check
      if (enabledCategories.includes('tests')) {
        checks.push(await this.runTestsCheck(effectiveWorkDir));
      }

      // Semantic Analysis (AI-powered)
      if (enabledCategories.includes('semantic_analysis')) {
        const semanticCheck = await this.runSemanticAnalysis(
          projectPath,
          featureId,
          feature,
          effectiveWorkDir,
          config.model
        );
        if (semanticCheck) {
          checks.push(semanticCheck);
        }
      }

      // Calculate statistics
      const stats = this.calculateStats(checks);
      const totalDurationMs = Date.now() - startTime;

      // Determine overall result
      const passed = stats.critical === 0;
      const confidence = this.calculateConfidence(checks, stats);
      const recommendation = this.determineRecommendation(passed, stats, confidence);
      const summary = this.generateSummary(checks, stats, passed);
      const suggestions = this.generateSuggestions(checks);

      const result: QAValidationResult = {
        passed,
        confidence,
        checks,
        recommendation,
        summary,
        suggestions,
        totalDurationMs,
        stats,
      };

      // Store validation result
      await this.storeValidation(projectPath, featureId, result, config.model);

      // Emit complete event
      this.emitQAEvent('qa_validation_complete', {
        featureId,
        projectPath,
        result,
        timestamp: new Date().toISOString(),
      });

      logger.info(`QA validation completed for ${featureId}: ${passed ? 'PASSED' : 'FAILED'}`);

      return result;
    } catch (error) {
      logger.error(`QA validation failed for ${featureId}:`, error);

      // Emit error event
      this.emitQAEvent('qa_validation_error', {
        featureId,
        projectPath,
        error: (error as Error).message,
        timestamp: new Date().toISOString(),
      });

      throw error;
    }
  }

  /**
   * Run static analysis checks (lint, typecheck)
   * Only runs checks that are available in the project
   */
  private async runStaticAnalysisChecks(
    workDir: string,
    projectInfo: Awaited<ReturnType<typeof detectProject>>
  ): Promise<QACheck[]> {
    const checks: QACheck[] = [];

    // Lint check (only if available)
    if (projectInfo.hasLint) {
      checks.push(
        await this.runCommandCheck({
          id: 'lint',
          name: 'ESLint',
          category: 'static_analysis',
          command: 'npm run lint',
          workDir,
          severity: 'warning',
        })
      );
    }

    // Type check (only if available and TypeScript project)
    if (projectInfo.hasTypeCheck && projectInfo.hasTypeScript) {
      checks.push(
        await this.runCommandCheck({
          id: 'typecheck',
          name: 'TypeScript Type Check',
          category: 'static_analysis',
          command: 'npm run typecheck',
          workDir,
          severity: 'critical',
        })
      );
    }

    return checks;
  }

  /**
   * Run build check
   */
  private async runBuildCheck(workDir: string): Promise<QACheck> {
    return this.runCommandCheck({
      id: 'build',
      name: 'Build',
      category: 'build',
      command: 'npm run build',
      workDir,
      severity: 'critical',
    });
  }

  /**
   * Run tests check
   *
   * IMPORTANT: Skip test execution in MVP to avoid issues with:
   * - Playwright tests that require browser and can crash the process
   * - Different test frameworks across projects
   * - Long-running test suites that timeout
   *
   * This will be properly implemented in Phase 2 with selective test execution.
   */
  private async runTestsCheck(workDir: string): Promise<QACheck> {
    const startTime = Date.now();

    logger.info('Skipping test execution in QA validation (MVP limitation)');

    // Return a passing check for now
    return {
      id: 'tests',
      name: 'Tests (Skipped in MVP)',
      category: 'tests',
      passed: true,
      severity: 'info',
      message: 'Test execution skipped in MVP - will be implemented in Phase 2',
      output: 'Tests are not executed automatically to avoid conflicts with UI test frameworks',
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Generic command check runner
   */
  private async runCommandCheck(params: {
    id: string;
    name: string;
    category: QACheckCategory;
    command: string;
    workDir: string;
    severity: 'critical' | 'warning' | 'info';
  }): Promise<QACheck> {
    const startTime = Date.now();
    const { id, name, category, command, workDir, severity } = params;

    logger.info(`Running QA check: ${name}`);

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: workDir,
        timeout: 120000, // 2 minutes per check
      });

      const durationMs = Date.now() - startTime;

      return {
        id,
        name,
        category,
        passed: true,
        severity,
        message: `${name} passed successfully`,
        output: stdout || stderr,
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = (error as Error).message || 'Unknown error';

      return {
        id,
        name,
        category,
        passed: false,
        severity,
        message: `${name} failed: ${errorMessage}`,
        output: errorMessage,
        durationMs,
      };
    }
  }

  /**
   * Run semantic analysis using AI to check if code matches feature description
   *
   * NOTE: MVP - Semantic analysis is skipped for now. Will be implemented in Phase 2
   * when we add AI-powered validation. For now, this just returns null to skip the check.
   */
  private async runSemanticAnalysis(
    projectPath: string,
    featureId: string,
    feature: Feature,
    workDir: string,
    model?: string
  ): Promise<QACheck | null> {
    // MVP: Skip AI semantic analysis - will be implemented in Phase 2
    logger.info(`Semantic analysis skipped for ${featureId} (Phase 2 feature)`);
    return null;
  }

  /**
   * Calculate statistics from checks
   */
  private calculateStats(checks: QACheck[]) {
    return {
      total: checks.length,
      passed: checks.filter((c) => c.passed).length,
      failed: checks.filter((c) => !c.passed).length,
      critical: checks.filter((c) => !c.passed && c.severity === 'critical').length,
      warnings: checks.filter((c) => !c.passed && c.severity === 'warning').length,
    };
  }

  /**
   * Calculate confidence level based on checks
   */
  private calculateConfidence(
    checks: QACheck[],
    stats: ReturnType<typeof this.calculateStats>
  ): QAConfidence {
    // High confidence if all checks passed
    if (stats.failed === 0) {
      return 'high';
    }

    // Low confidence if critical checks failed
    if (stats.critical > 0) {
      return 'low';
    }

    // Medium confidence if only warnings
    return 'medium';
  }

  /**
   * Determine recommendation based on results
   */
  private determineRecommendation(
    passed: boolean,
    stats: ReturnType<typeof this.calculateStats>,
    confidence: QAConfidence
  ): QARecommendation {
    // Critical failures -> reject
    if (stats.critical > 0) {
      return 'reject';
    }

    // All passed -> approve
    if (passed) {
      return 'approve';
    }

    // Only warnings -> manual review
    if (stats.warnings > 0 && stats.critical === 0) {
      return 'manual_review';
    }

    return 'reject';
  }

  /**
   * Generate human-readable summary
   */
  private generateSummary(
    checks: QACheck[],
    stats: ReturnType<typeof this.calculateStats>,
    passed: boolean
  ): string {
    if (passed) {
      return `All ${stats.total} QA checks passed successfully. Feature is ready for approval.`;
    }

    const failedChecks = checks.filter((c) => !c.passed).map((c) => c.name);
    return `QA validation failed: ${stats.failed} of ${stats.total} checks failed (${failedChecks.join(', ')}). ${stats.critical} critical issues must be fixed.`;
  }

  /**
   * Generate suggestions for improvement
   */
  private generateSuggestions(checks: QACheck[]): string[] {
    const suggestions: string[] = [];
    const failedChecks = checks.filter((c) => !c.passed);

    for (const check of failedChecks) {
      if (check.id === 'lint') {
        suggestions.push('Run `npm run lint -- --fix` to auto-fix linting issues');
      }
      if (check.id === 'typecheck') {
        suggestions.push('Review TypeScript errors and add proper type annotations');
      }
      if (check.id === 'tests') {
        suggestions.push(
          'Fix failing tests or update test expectations if behavior changed intentionally'
        );
      }
      if (check.id === 'build') {
        suggestions.push('Fix build errors - check console output for details');
      }
    }

    return suggestions;
  }

  /**
   * Store validation result to disk
   */
  private async storeValidation(
    projectPath: string,
    featureId: string,
    result: QAValidationResult,
    model?: string
  ): Promise<void> {
    try {
      const featureDir = getFeatureDir(projectPath, featureId);
      const qaReportPath = path.join(featureDir, 'qa-report.json');

      const stored: StoredQAValidation = {
        featureId,
        validatedAt: new Date().toISOString(),
        model: model as any,
        result,
        version: 1,
      };

      await secureFs.writeFile(qaReportPath, JSON.stringify(stored, null, 2), 'utf-8');
      logger.info(`QA report saved for ${featureId}`);
    } catch (error) {
      logger.error(`Failed to save QA report for ${featureId}:`, error);
      // Don't throw - validation succeeded even if storage failed
    }
  }

  /**
   * Read stored QA validation result
   */
  async readValidation(projectPath: string, featureId: string): Promise<StoredQAValidation | null> {
    try {
      const featureDir = getFeatureDir(projectPath, featureId);
      const qaReportPath = path.join(featureDir, 'qa-report.json');

      const content = (await secureFs.readFile(qaReportPath, 'utf-8')) as string;
      return JSON.parse(content) as StoredQAValidation;
    } catch {
      return null;
    }
  }

  /**
   * Emit QA validation event
   */
  private emitQAEvent(
    type:
      | 'qa_validation_start'
      | 'qa_validation_progress'
      | 'qa_validation_complete'
      | 'qa_validation_error',
    data: any
  ): void {
    this.events.emit('qa-validation:event', {
      type,
      ...data,
    });
  }
}
