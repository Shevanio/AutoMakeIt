/**
 * Context Loader - Loads project context files for agent prompts
 *
 * Provides a shared utility to load context files from .automaker/context/
 * and format them as system prompt content. Used by both auto-mode-service
 * and agent-service to ensure all agents are aware of project context.
 *
 * Context files contain project-specific rules, conventions, and guidelines
 * that agents must follow when working on the project.
 *
 * Supports:
 * - Recursive directory scanning (folders within .automaker/context/)
 * - File synchronization from external sources
 * - Images and text files (.md, .txt, .png, .jpg, etc.)
 */

import path from 'path';
import fs from 'fs/promises';

/**
 * Metadata for a single context file
 */
export interface ContextFileMetadata {
  description: string;
  /** Original source path if this file was imported/synced from elsewhere */
  sourcePath?: string;
  /** Timestamp of last sync (ISO 8601) */
  lastSyncedAt?: string;
}

/**
 * Metadata structure for context files
 * Stored in {projectPath}/.automaker/context/context-metadata.json
 *
 * Keys are relative paths from context directory (e.g., 'CLAUDE.md', 'docs/api/auth.md')
 */
export interface ContextMetadata {
  files: Record<string, ContextFileMetadata>;
}

/**
 * Individual context file with metadata
 */
export interface ContextFileInfo {
  name: string;
  path: string;
  /** Relative path from context directory (e.g., 'docs/api/auth.md') */
  relativePath: string;
  content: string;
  description?: string;
  /** Original source path if imported */
  sourcePath?: string;
  /** Timestamp of last sync */
  lastSyncedAt?: string;
}

/**
 * Result of loading context files
 */
export interface ContextFilesResult {
  files: ContextFileInfo[];
  formattedPrompt: string;
}

/**
 * Options for loading context files
 */
export interface LoadContextFilesOptions {
  /** Project path to load context from */
  projectPath: string;
  /** Optional custom secure fs module (for dependency injection) */
  fsModule?: {
    access: (path: string) => Promise<void>;
    readdir: (path: string) => Promise<string[]>;
    readFile: (path: string, encoding: string) => Promise<string>;
    stat?: (path: string) => Promise<{ isDirectory: () => boolean; isFile: () => boolean }>;
  };
}

/**
 * Get the context directory path for a project
 */
function getContextDir(projectPath: string): string {
  return path.join(projectPath, '.automaker', 'context');
}

/**
 * Check if a file is a text-based context file
 */
function isTextFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return lower.endsWith('.md') || lower.endsWith('.txt');
}

/**
 * Check if a file is an image file
 */
function isImageFile(filename: string): boolean {
  const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp'];
  const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
  return imageExtensions.includes(ext);
}

/**
 * Check if a file should be included as context
 */
function isContextFile(filename: string): boolean {
  return (isTextFile(filename) || isImageFile(filename)) && filename !== 'context-metadata.json';
}

/**
 * Load context metadata from the metadata file
 */
async function loadContextMetadata(
  contextDir: string,
  fsModule: typeof fs
): Promise<ContextMetadata> {
  const metadataPath = path.join(contextDir, 'context-metadata.json');
  try {
    const content = await fsModule.readFile(metadataPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    // Metadata file doesn't exist yet - that's fine
    return { files: {} };
  }
}

/**
 * Recursively scan a directory for context files
 */
async function scanDirectoryRecursive(
  dirPath: string,
  basePath: string,
  fsModule: typeof fs
): Promise<Array<{ absolutePath: string; relativePath: string }>> {
  const results: Array<{ absolutePath: string; relativePath: string }> = [];

  try {
    const entries = await fsModule.readdir(dirPath);

    for (const entry of entries) {
      // Skip metadata file
      if (entry === 'context-metadata.json') {
        continue;
      }

      const absolutePath = path.join(dirPath, entry);
      const relativePath = path.relative(basePath, absolutePath);

      try {
        // Check if it's a directory or file
        const statFn = fsModule.stat || fs.stat;
        const stats = await statFn(absolutePath);

        if (stats.isDirectory()) {
          // Recursively scan subdirectory
          const subResults = await scanDirectoryRecursive(absolutePath, basePath, fsModule);
          results.push(...subResults);
        } else if (stats.isFile() && isContextFile(entry)) {
          // Add file to results
          results.push({ absolutePath, relativePath });
        }
      } catch (error) {
        console.warn(`[ContextLoader] Failed to stat ${absolutePath}:`, error);
      }
    }
  } catch (error) {
    console.warn(`[ContextLoader] Failed to read directory ${dirPath}:`, error);
  }

  return results;
}

/**
 * Format a single context file entry for the prompt
 */
function formatContextFileEntry(file: ContextFileInfo): string {
  const header = `## ${file.relativePath}`;
  const pathInfo = `**Path:** \`${file.path}\``;

  let descriptionInfo = '';
  if (file.description) {
    descriptionInfo = `\n**Purpose:** ${file.description}`;
  }

  // For images, don't include content (it's base64 or binary)
  const fileName = file.name.toLowerCase();
  if (isImageFile(fileName)) {
    return `${header}\n${pathInfo}${descriptionInfo}\n\n[Image file: ${file.name}]`;
  }

  return `${header}\n${pathInfo}${descriptionInfo}\n\n${file.content}`;
}

/**
 * Build the formatted system prompt from context files
 */
function buildContextPrompt(files: ContextFileInfo[]): string {
  if (files.length === 0) {
    return '';
  }

  const formattedFiles = files.map(formatContextFileEntry);

  return `# Project Context Files

The following context files provide project-specific rules, conventions, and guidelines.
Each file serves a specific purpose - use the description to understand when to reference it.
If you need more details about a context file, you can read the full file at the path provided.

**IMPORTANT**: You MUST follow the rules and conventions specified in these files.
- Follow ALL commands exactly as shown (e.g., if the project uses \`pnpm\`, NEVER use \`npm\` or \`npx\`)
- Follow ALL coding conventions, commit message formats, and architectural patterns specified
- Reference these rules before running ANY shell commands or making commits

---

${formattedFiles.join('\n\n---\n\n')}

---

**REMINDER**: Before taking any action, verify you are following the conventions specified above.
`;
}

/**
 * Load context files from a project's .automaker/context/ directory
 *
 * This function recursively loads all .md, .txt, and image files from the context directory,
 * along with their metadata (descriptions, source paths, sync timestamps), and formats
 * them into a system prompt that can be prepended to agent prompts.
 *
 * @param options - Configuration options
 * @returns Promise resolving to context files and formatted prompt
 *
 * @example
 * ```typescript
 * const { formattedPrompt, files } = await loadContextFiles({
 *   projectPath: '/path/to/project'
 * });
 *
 * // Use as system prompt
 * const executeOptions = {
 *   prompt: userPrompt,
 *   systemPrompt: formattedPrompt,
 * };
 * ```
 */
export async function loadContextFiles(
  options: LoadContextFilesOptions
): Promise<ContextFilesResult> {
  const { projectPath, fsModule = fs } = options;
  const contextDir = path.resolve(getContextDir(projectPath));

  try {
    // Check if directory exists
    await fsModule.access(contextDir);

    // Recursively scan for all context files
    const foundFiles = await scanDirectoryRecursive(contextDir, contextDir, fsModule as typeof fs);

    if (foundFiles.length === 0) {
      return { files: [], formattedPrompt: '' };
    }

    // Load metadata for descriptions and sync info
    const metadata = await loadContextMetadata(contextDir, fsModule as typeof fs);

    // Load each file with its content and metadata
    const files: ContextFileInfo[] = [];
    for (const { absolutePath, relativePath } of foundFiles) {
      try {
        const content = await fsModule.readFile(absolutePath, 'utf-8');
        const fileName = path.basename(absolutePath);
        const fileMetadata = metadata.files[relativePath];

        files.push({
          name: fileName,
          path: absolutePath,
          relativePath,
          content,
          description: fileMetadata?.description,
          sourcePath: fileMetadata?.sourcePath,
          lastSyncedAt: fileMetadata?.lastSyncedAt,
        });
      } catch (error) {
        console.warn(`[ContextLoader] Failed to read context file ${relativePath}:`, error);
      }
    }

    const formattedPrompt = buildContextPrompt(files);

    console.log(
      `[ContextLoader] Loaded ${files.length} context file(s): ${files.map((f) => f.relativePath).join(', ')}`
    );

    return { files, formattedPrompt };
  } catch {
    // Context directory doesn't exist or is inaccessible - this is fine
    return { files: [], formattedPrompt: '' };
  }
}

/**
 * Get a summary of available context files (names and descriptions only)
 * Useful for informing the agent about what context is available without
 * loading full content.
 */
export async function getContextFilesSummary(options: LoadContextFilesOptions): Promise<
  Array<{
    name: string;
    path: string;
    relativePath: string;
    description?: string;
    sourcePath?: string;
    lastSyncedAt?: string;
  }>
> {
  const { projectPath, fsModule = fs } = options;
  const contextDir = path.resolve(getContextDir(projectPath));

  try {
    await fsModule.access(contextDir);

    // Recursively scan for all context files
    const foundFiles = await scanDirectoryRecursive(contextDir, contextDir, fsModule as typeof fs);

    if (foundFiles.length === 0) {
      return [];
    }

    const metadata = await loadContextMetadata(contextDir, fsModule as typeof fs);

    return foundFiles.map(({ absolutePath, relativePath }) => {
      const fileName = path.basename(absolutePath);
      const fileMetadata = metadata.files[relativePath];

      return {
        name: fileName,
        path: absolutePath,
        relativePath,
        description: fileMetadata?.description,
        sourcePath: fileMetadata?.sourcePath,
        lastSyncedAt: fileMetadata?.lastSyncedAt,
      };
    });
  } catch {
    return [];
  }
}
