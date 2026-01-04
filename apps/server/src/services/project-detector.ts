/**
 * Project Detector - Detects project type and available tooling
 *
 * Used by QA Service to determine which validation checks are applicable
 * for a given project.
 */

import * as secureFs from '../lib/secure-fs.js';
import path from 'path';
import { createLogger } from '@automakeit/utils';

const logger = createLogger('ProjectDetector');

export type ProjectType =
  | 'typescript-monorepo'
  | 'typescript-node'
  | 'javascript-node'
  | 'react-vite'
  | 'nextjs'
  | 'python'
  | 'static-html'
  | 'unknown';

export interface ProjectInfo {
  type: ProjectType;
  hasTypeScript: boolean;
  hasLint: boolean;
  hasTypeCheck: boolean;
  hasBuild: boolean;
  hasTest: boolean;
  packageManager: 'npm' | 'yarn' | 'pnpm' | 'bun' | 'pip' | 'none';
  language: 'typescript' | 'javascript' | 'python' | 'html' | 'mixed' | 'unknown';
}

/**
 * Detect project type and available tooling
 */
export async function detectProject(projectPath: string): Promise<ProjectInfo> {
  logger.info(`Detecting project type at: ${projectPath}`);

  const info: ProjectInfo = {
    type: 'unknown',
    hasTypeScript: false,
    hasLint: false,
    hasTypeCheck: false,
    hasBuild: false,
    hasTest: false,
    packageManager: 'none',
    language: 'unknown',
  };

  // Check for package.json (Node.js/TypeScript projects)
  const packageJsonPath = path.join(projectPath, 'package.json');
  const hasPackageJson = await fileExists(packageJsonPath);

  if (hasPackageJson) {
    await analyzeNodeProject(projectPath, packageJsonPath, info);
  } else {
    // Check for other project types
    await analyzeNonNodeProject(projectPath, info);
  }

  logger.info(`Project detected as: ${info.type}`, {
    language: info.language,
    packageManager: info.packageManager,
    availableChecks: {
      lint: info.hasLint,
      typecheck: info.hasTypeCheck,
      build: info.hasBuild,
      test: info.hasTest,
    },
  });

  return info;
}

/**
 * Analyze Node.js/TypeScript projects
 */
async function analyzeNodeProject(
  projectPath: string,
  packageJsonPath: string,
  info: ProjectInfo
): Promise<void> {
  try {
    const content = (await secureFs.readFile(packageJsonPath, 'utf-8')) as string;
    const pkg = JSON.parse(content);

    // Detect package manager
    if (await fileExists(path.join(projectPath, 'package-lock.json'))) {
      info.packageManager = 'npm';
    } else if (await fileExists(path.join(projectPath, 'yarn.lock'))) {
      info.packageManager = 'yarn';
    } else if (await fileExists(path.join(projectPath, 'pnpm-lock.yaml'))) {
      info.packageManager = 'pnpm';
    } else if (await fileExists(path.join(projectPath, 'bun.lockb'))) {
      info.packageManager = 'bun';
    } else {
      info.packageManager = 'npm'; // default
    }

    // Check for TypeScript
    const hasTsConfig = await fileExists(path.join(projectPath, 'tsconfig.json'));
    const hasTsDependency =
      pkg.dependencies?.typescript ||
      pkg.devDependencies?.typescript ||
      pkg.dependencies?.['@types/node'] ||
      pkg.devDependencies?.['@types/node'];

    info.hasTypeScript = hasTsConfig || !!hasTsDependency;
    info.language = info.hasTypeScript ? 'typescript' : 'javascript';

    // Check available scripts
    const scripts = pkg.scripts || {};
    info.hasLint = !!(scripts.lint || scripts.eslint);
    info.hasTypeCheck = !!(scripts.typecheck || scripts['type-check'] || scripts.tsc);
    info.hasBuild = !!scripts.build;
    info.hasTest = !!(scripts.test || scripts['test:unit'] || scripts['test:server']);

    // Detect project type
    if (pkg.workspaces) {
      info.type = 'typescript-monorepo';
    } else if (pkg.dependencies?.next || pkg.devDependencies?.next) {
      info.type = 'nextjs';
    } else if (pkg.dependencies?.vite || pkg.devDependencies?.vite) {
      info.type = 'react-vite';
    } else if (info.hasTypeScript) {
      info.type = 'typescript-node';
    } else {
      info.type = 'javascript-node';
    }
  } catch (error) {
    logger.warn(`Failed to analyze package.json:`, error);
    info.type = 'unknown';
  }
}

/**
 * Analyze non-Node.js projects (Python, static HTML, etc.)
 */
async function analyzeNonNodeProject(projectPath: string, info: ProjectInfo): Promise<void> {
  // Check for Python
  const hasPyProject = await fileExists(path.join(projectPath, 'pyproject.toml'));
  const hasRequirements = await fileExists(path.join(projectPath, 'requirements.txt'));
  const hasSetupPy = await fileExists(path.join(projectPath, 'setup.py'));

  if (hasPyProject || hasRequirements || hasSetupPy) {
    info.type = 'python';
    info.language = 'python';
    info.packageManager = 'pip';
    // Python checks would be: pylint, mypy, pytest
    info.hasLint = await commandExists('pylint');
    info.hasTypeCheck = await commandExists('mypy');
    info.hasTest = await commandExists('pytest');
    return;
  }

  // Check for static HTML
  const hasIndexHtml = await fileExists(path.join(projectPath, 'index.html'));
  if (hasIndexHtml) {
    info.type = 'static-html';
    info.language = 'html';
    info.packageManager = 'none';
    return;
  }

  // Unknown project type
  info.type = 'unknown';
  info.language = 'unknown';
}

/**
 * Check if a file exists
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await secureFs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a command exists in PATH
 */
async function commandExists(command: string): Promise<boolean> {
  try {
    const { execSync } = await import('child_process');
    execSync(`which ${command}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get recommended QA checks for a project type
 */
export function getRecommendedChecks(info: ProjectInfo): string[] {
  const checks: string[] = [];

  // Static analysis (language-specific)
  if (info.language === 'typescript' || info.language === 'javascript') {
    if (info.hasLint) checks.push('lint');
    if (info.hasTypeCheck && info.hasTypeScript) checks.push('typecheck');
  } else if (info.language === 'python') {
    if (info.hasLint) checks.push('pylint');
    if (info.hasTypeCheck) checks.push('mypy');
  }

  // Build check (if available)
  if (info.hasBuild) {
    checks.push('build');
  }

  // Tests (if available)
  if (info.hasTest) {
    checks.push('test');
  }

  return checks;
}
