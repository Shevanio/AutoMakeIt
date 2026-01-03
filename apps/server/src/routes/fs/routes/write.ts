/**
 * POST /write endpoint - Write file
 */

import type { Request, Response } from 'express';
import * as secureFs from '../../../lib/secure-fs.js';
import fs from 'fs/promises';
import path from 'path';
import { PathNotAllowedError, getContextDir } from '@automakeit/platform';
import { mkdirSafe, createLogger } from '@automakeit/utils';
import { getErrorMessage, logError } from '../common.js';

const logger = createLogger('WriteFile');

/**
 * Create a symlink to app_spec.txt in the context directory
 * This ensures agents have access to architectural documentation when implementing features
 */
async function createAppSpecSymlinkIfNeeded(filePath: string): Promise<void> {
  try {
    const resolvedPath = path.resolve(filePath);
    const filename = path.basename(resolvedPath);

    // Only create symlink if this is app_spec.txt
    if (filename !== 'app_spec.txt') {
      return;
    }

    // Check if this is in .automaker directory
    if (!resolvedPath.includes('.automaker')) {
      return;
    }

    // Extract project path from .automaker/app_spec.txt
    const automakerDir = path.dirname(resolvedPath);
    const projectPath = path.dirname(automakerDir);

    // Get context directory
    const contextDir = getContextDir(projectPath);
    await mkdirSafe(contextDir);

    const symlinkPath = path.join(contextDir, 'app_spec.txt');

    // Remove existing symlink if it exists
    try {
      await secureFs.unlink(symlinkPath);
      logger.info(`Removed existing symlink: ${symlinkPath}`);
    } catch {
      // OK if doesn't exist
    }

    // Create symlink (relative path: ../app_spec.txt)
    await fs.symlink('../app_spec.txt', symlinkPath);
    logger.info(`Created symlink: ${symlinkPath} -> ../app_spec.txt`);

    // Update context metadata
    const metadataPath = path.join(contextDir, 'context-metadata.json');
    let metadata: { files: Record<string, { description: string }> } = { files: {} };

    try {
      const existingContent = await secureFs.readFile(metadataPath, 'utf-8');
      metadata = JSON.parse(existingContent as string);
    } catch {
      // OK if doesn't exist
    }

    // Add/update app_spec.txt metadata
    metadata.files['app_spec.txt'] = {
      description: 'Project architecture documentation (auto-synced from multi-agent analysis)',
    };

    await secureFs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
    logger.info(`Updated context metadata: ${metadataPath}`);
  } catch (error) {
    // Don't fail the write operation if symlink creation fails
    logger.warn(`Failed to create app_spec.txt symlink:`, error);
  }
}

export function createWriteHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { filePath, content } = req.body as {
        filePath: string;
        content: string;
      };

      if (!filePath) {
        res.status(400).json({ success: false, error: 'filePath is required' });
        return;
      }

      // Ensure parent directory exists (symlink-safe)
      await mkdirSafe(path.dirname(path.resolve(filePath)));
      await secureFs.writeFile(filePath, content, 'utf-8');

      // If writing app_spec.txt, create symlink in context/ directory
      await createAppSpecSymlinkIfNeeded(filePath);

      res.json({ success: true });
    } catch (error) {
      // Path not allowed - return 403 Forbidden
      if (error instanceof PathNotAllowedError) {
        res.status(403).json({ success: false, error: getErrorMessage(error) });
        return;
      }

      logError(error, 'Write file failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
