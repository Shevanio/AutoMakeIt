/**
 * Security utilities for path validation
 * Enforces ALLOWED_ROOT_DIRECTORY constraint with appData exception
 */

import path from 'path';

/**
 * Error thrown when a path is not allowed by security policy
 */
export class PathNotAllowedError extends Error {
  constructor(filePath: string) {
    super(`Path not allowed: ${filePath}. Must be within ALLOWED_ROOT_DIRECTORY or DATA_DIR.`);
    this.name = 'PathNotAllowedError';
  }
}

// Allowed root directory - main security boundary
let allowedRootDirectory: string | null = null;

// Data directory - always allowed for settings/credentials
let dataDirectory: string | null = null;

/**
 * Initialize security settings from environment variables
 *
 * Loads and validates security configuration from environment:
 * - ALLOWED_ROOT_DIRECTORY: main security boundary for file operations
 * - DATA_DIR: appData exception, always allowed for settings/credentials
 *
 * @example
 * ```typescript
 * // Set environment variables first
 * process.env.ALLOWED_ROOT_DIRECTORY = '/home/user/projects';
 * process.env.DATA_DIR = '/home/user/.automaker';
 *
 * // Initialize security
 * initAllowedPaths();
 * ```
 */
export function initAllowedPaths(): void {
  // Load ALLOWED_ROOT_DIRECTORY
  const rootDir = process.env.ALLOWED_ROOT_DIRECTORY;
  if (rootDir) {
    allowedRootDirectory = path.resolve(rootDir);
    console.log(`[Security] ✓ ALLOWED_ROOT_DIRECTORY configured: ${allowedRootDirectory}`);
  } else {
    console.log('[Security] ⚠️  ALLOWED_ROOT_DIRECTORY not set - allowing access to all paths');
  }

  // Load DATA_DIR (appData exception - always allowed)
  const dataDir = process.env.DATA_DIR;
  if (dataDir) {
    dataDirectory = path.resolve(dataDir);
    console.log(`[Security] ✓ DATA_DIR configured: ${dataDirectory}`);
  }
}

/**
 * Check if a path is allowed based on ALLOWED_ROOT_DIRECTORY
 *
 * Returns true if:
 * - Path is within ALLOWED_ROOT_DIRECTORY, OR
 * - Path is within DATA_DIR (appData exception), OR
 * - No restrictions are configured (backward compatibility)
 *
 * @param filePath - Path to check (can be relative or absolute)
 * @returns true if path is allowed, false otherwise
 * @example
 * ```typescript
 * if (isPathAllowed('/home/user/project/file.txt')) {
 *   // Safe to access this file
 *   await fs.readFile('/home/user/project/file.txt');
 * }
 * ```
 */
export function isPathAllowed(filePath: string): boolean {
  const resolvedPath = path.resolve(filePath);

  // Always allow appData directory (settings, credentials)
  if (dataDirectory && isPathWithinDirectory(resolvedPath, dataDirectory)) {
    return true;
  }

  // If no ALLOWED_ROOT_DIRECTORY restriction is configured, allow all paths
  // Note: DATA_DIR is checked above as an exception, but doesn't restrict other paths
  if (!allowedRootDirectory) {
    return true;
  }

  // Allow if within ALLOWED_ROOT_DIRECTORY
  if (allowedRootDirectory && isPathWithinDirectory(resolvedPath, allowedRootDirectory)) {
    return true;
  }

  // If restrictions are configured but path doesn't match, deny
  return false;
}

/**
 * Validate a path - resolves it and checks permissions
 *
 * @param filePath - Path to validate (can be relative or absolute)
 * @returns Resolved absolute path if allowed
 * @throws PathNotAllowedError if path is not within allowed directories
 * @example
 * ```typescript
 * try {
 *   const safePath = validatePath('../../../etc/passwd');
 *   // This will throw if path is outside allowed directories
 * } catch (error) {
 *   if (error instanceof PathNotAllowedError) {
 *     console.error('Access denied:', error.message);
 *   }
 * }
 * ```
 */
export function validatePath(filePath: string): string {
  const resolvedPath = path.resolve(filePath);

  if (!isPathAllowed(resolvedPath)) {
    throw new PathNotAllowedError(filePath);
  }

  return resolvedPath;
}

/**
 * Check if a path is within a directory, with protection against path traversal
 *
 * Uses path.relative() to detect ".." traversal attempts. Returns true only
 * if resolvedPath is actually within directoryPath.
 *
 * @param resolvedPath - Absolute path to check
 * @param directoryPath - Absolute directory path to check against
 * @returns true if resolvedPath is within directoryPath, false otherwise
 * @example
 * ```typescript
 * isPathWithinDirectory('/home/user/projects/app/file.txt', '/home/user/projects');
 * // Returns: true
 *
 * isPathWithinDirectory('/etc/passwd', '/home/user/projects');
 * // Returns: false
 * ```
 */
export function isPathWithinDirectory(resolvedPath: string, directoryPath: string): boolean {
  // Get the relative path from directory to the target
  const relativePath = path.relative(directoryPath, resolvedPath);

  // If relative path starts with "..", it's outside the directory
  // If relative path is absolute, it's outside the directory
  // If relative path is empty or ".", it's the directory itself
  return !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
}

/**
 * Get the configured allowed root directory
 *
 * @returns Absolute path to allowed root directory, or null if not configured
 * @example
 * ```typescript
 * const rootDir = getAllowedRootDirectory();
 * if (rootDir) {
 *   console.log(`File operations restricted to: ${rootDir}`);
 * }
 * ```
 */
export function getAllowedRootDirectory(): string | null {
  return allowedRootDirectory;
}

/**
 * Get the configured data directory
 *
 * @returns Absolute path to data directory (always allowed), or null if not configured
 * @example
 * ```typescript
 * const dataDir = getDataDirectory();
 * if (dataDir) {
 *   console.log(`Settings stored in: ${dataDir}`);
 * }
 * ```
 */
export function getDataDirectory(): string | null {
  return dataDirectory;
}

/**
 * Get list of allowed paths (for debugging)
 *
 * @returns Array of absolute paths that are allowed for file operations
 * @example
 * ```typescript
 * const allowed = getAllowedPaths();
 * console.log('Allowed paths:', allowed);
 * // Output: ['/home/user/projects', '/home/user/.automaker']
 * ```
 */
export function getAllowedPaths(): string[] {
  const paths: string[] = [];
  if (allowedRootDirectory) {
    paths.push(allowedRootDirectory);
  }
  if (dataDirectory) {
    paths.push(dataDirectory);
  }
  return paths;
}

/**
 * SECURITY: Sanitize a filename to prevent path traversal attacks
 * Removes dangerous characters and path components like ".." and "/"
 *
 * @param filename - User-provided filename
 * @returns Sanitized filename safe for filesystem operations
 * @throws Error if filename is empty after sanitization
 *
 * @example
 * sanitizeFilename("../../etc/passwd") // Returns "etcpasswd"
 * sanitizeFilename("image.png") // Returns "image.png"
 * sanitizeFilename("my file (1).jpg") // Returns "my file (1).jpg"
 */
export function sanitizeFilename(filename: string): string {
  if (!filename || typeof filename !== 'string') {
    throw new Error('Filename must be a non-empty string');
  }

  // Normalize path separators to forward slashes first (handles Windows paths on Unix)
  let normalized = filename.replace(/\\/g, '/');

  // Remove path components - only keep the basename
  let sanitized = path.basename(normalized);

  // Remove any remaining path traversal attempts
  sanitized = sanitized.replace(/\.\./g, '');

  // Remove null bytes (security: can bypass extension checks)
  sanitized = sanitized.replace(/\0/g, '');

  // Remove any remaining path separators and drive letters (/, \, :)
  sanitized = sanitized.replace(/[/\\:]/g, '');

  // Remove leading/trailing dots and whitespace
  sanitized = sanitized.trim().replace(/^\.+/, '');

  // Validate result is not empty
  if (!sanitized) {
    throw new Error(`Invalid filename: "${filename}" cannot be sanitized to a safe name`);
  }

  return sanitized;
}
