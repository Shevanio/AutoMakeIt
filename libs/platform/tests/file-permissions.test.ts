/**
 * Tests for secure file permissions
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as secureFs from '../src/secure-fs.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('secure-fs.ts - File Permissions', () => {
  const testDir = path.join(__dirname, 'test-permissions');
  const testFile = path.join(testDir, 'test-file.txt');

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('writeFile permissions', () => {
    it('should set restrictive permissions (0600) on new files', async () => {
      // Skip on Windows where chmod behaves differently
      if (process.platform === 'win32') {
        console.log('[Test] Skipping permission test on Windows');
        return;
      }

      await secureFs.writeFile(testFile, 'test content');

      const stats = await fs.stat(testFile);
      const mode = stats.mode & 0o777; // Extract permission bits

      // Should be 0600 (rw-------)
      expect(mode).toBe(0o600);
    });

    it('should set restrictive permissions on files with encoding', async () => {
      if (process.platform === 'win32') {
        console.log('[Test] Skipping permission test on Windows');
        return;
      }

      await secureFs.writeFile(testFile, 'test content', 'utf-8');

      const stats = await fs.stat(testFile);
      const mode = stats.mode & 0o777;

      expect(mode).toBe(0o600);
    });

    it('should set restrictive permissions on Buffer writes', async () => {
      if (process.platform === 'win32') {
        console.log('[Test] Skipping permission test on Windows');
        return;
      }

      const buffer = Buffer.from('test content');
      await secureFs.writeFile(testFile, buffer);

      const stats = await fs.stat(testFile);
      const mode = stats.mode & 0o777;

      expect(mode).toBe(0o600);
    });

    it('should successfully write file content regardless of chmod success', async () => {
      // This test works on all platforms
      await secureFs.writeFile(testFile, 'test content');

      const content = await fs.readFile(testFile, 'utf-8');
      expect(content).toBe('test content');
    });

    it('should not fail write operation if chmod fails', async () => {
      // Even if chmod fails (e.g., on Windows), the write should succeed
      await expect(secureFs.writeFile(testFile, 'test')).resolves.toBeUndefined();
    });
  });

  describe('Permission verification', () => {
    it('should prevent group read access', async () => {
      if (process.platform === 'win32') {
        console.log('[Test] Skipping permission test on Windows');
        return;
      }

      await secureFs.writeFile(testFile, 'sensitive data');

      const stats = await fs.stat(testFile);
      const mode = stats.mode & 0o777;

      // Group should not have read permission (bit 4 = 0)
      expect((mode & 0o040) === 0).toBe(true);
    });

    it('should prevent other read access', async () => {
      if (process.platform === 'win32') {
        console.log('[Test] Skipping permission test on Windows');
        return;
      }

      await secureFs.writeFile(testFile, 'sensitive data');

      const stats = await fs.stat(testFile);
      const mode = stats.mode & 0o777;

      // Others should not have read permission (bit 2 = 0)
      expect((mode & 0o004) === 0).toBe(true);
    });

    it('should allow owner read and write', async () => {
      if (process.platform === 'win32') {
        console.log('[Test] Skipping permission test on Windows');
        return;
      }

      await secureFs.writeFile(testFile, 'sensitive data');

      const stats = await fs.stat(testFile);
      const mode = stats.mode & 0o777;

      // Owner should have read (bit 8) and write (bit 7) permissions
      expect((mode & 0o600) === 0o600).toBe(true);
    });
  });

  describe('File content integrity', () => {
    it('should preserve file content after permission change', async () => {
      const content = 'This is sensitive content that should be protected';
      await secureFs.writeFile(testFile, content);

      const readContent = await fs.readFile(testFile, 'utf-8');
      expect(readContent).toBe(content);
    });

    it('should handle binary content correctly', async () => {
      const buffer = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xff, 0xfe]);
      await secureFs.writeFile(testFile, buffer);

      const readBuffer = await fs.readFile(testFile);
      expect(Buffer.compare(readBuffer, buffer)).toBe(0);
    });
  });

  describe('Cross-platform behavior', () => {
    it('should work on Windows even if chmod is not supported', async () => {
      // This test should pass on all platforms
      await secureFs.writeFile(testFile, 'test');

      const exists = await fs
        .access(testFile)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
    });
  });
});
