/**
 * Git worktree utilities
 * Provides functions for finding and managing git worktrees
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execAsync = promisify(exec);

/**
 * Find the worktree path for a specific branch
 *
 * @param projectPath - The main project repository path
 * @param branchName - The branch name to find worktree for
 * @returns The absolute path to the worktree, or null if not found
 * @example
 * ```typescript
 * const worktreePath = await findWorktreeForBranch('/path/to/repo', 'feature/my-feature');
 * if (worktreePath) {
 *   console.log(`Worktree found at: ${worktreePath}`);
 * } else {
 *   console.log('No worktree found for this branch');
 * }
 * ```
 */
export async function findWorktreeForBranch(
  projectPath: string,
  branchName: string
): Promise<string | null> {
  try {
    const { stdout } = await execAsync('git worktree list --porcelain', {
      cwd: projectPath,
    });

    const lines = stdout.split('\n');
    let currentPath: string | null = null;
    let currentBranch: string | null = null;

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        currentPath = line.slice(9); // Remove 'worktree ' prefix
      } else if (line.startsWith('branch ')) {
        currentBranch = line.slice(7).replace('refs/heads/', ''); // Remove 'branch ' prefix and refs/heads/
      } else if (line === '' && currentPath && currentBranch) {
        // End of a worktree entry
        if (currentBranch === branchName) {
          // Resolve to absolute path - git may return relative paths
          // On Windows, this is critical for cwd to work correctly
          // On all platforms, absolute paths ensure consistent behavior
          const resolvedPath = path.isAbsolute(currentPath)
            ? path.resolve(currentPath)
            : path.resolve(projectPath, currentPath);
          return resolvedPath;
        }
        currentPath = null;
        currentBranch = null;
      }
    }

    return null;
  } catch (error) {
    // git worktree command failed (not a git repo, or no worktrees)
    return null;
  }
}

/**
 * Resolve worktree path with fallback to project path
 *
 * Utility function that combines worktree lookup with fallback behavior.
 * If worktree is found, uses that path. Otherwise, falls back to the main project path.
 *
 * @param projectPath - The main project repository path
 * @param branchName - The branch name to find worktree for (null/undefined to skip worktree lookup)
 * @param useWorktrees - Whether to attempt worktree resolution
 * @returns Object containing the resolved working directory and worktree path (if found)
 * @example
 * ```typescript
 * const { workDir, worktreePath } = await resolveWorktreePath(
 *   '/path/to/repo',
 *   'feature/my-feature',
 *   true
 * );
 * console.log(`Working directory: ${workDir}`);
 * if (worktreePath) {
 *   console.log(`Using worktree at: ${worktreePath}`);
 * }
 * ```
 */
export async function resolveWorktreePath(
  projectPath: string,
  branchName: string | null | undefined,
  useWorktrees: boolean
): Promise<{ workDir: string; worktreePath: string | null }> {
  let worktreePath: string | null = null;

  if (useWorktrees && branchName) {
    worktreePath = await findWorktreeForBranch(projectPath, branchName);
  }

  const workDir = worktreePath ? path.resolve(worktreePath) : path.resolve(projectPath);

  return {
    workDir,
    worktreePath,
  };
}
