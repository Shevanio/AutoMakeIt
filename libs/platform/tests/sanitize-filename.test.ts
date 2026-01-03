/**
 * Tests for sanitizeFilename security function
 * Validates protection against path traversal attacks
 */

import { describe, it, expect } from 'vitest';
import { sanitizeFilename } from '../src/security.js';

describe('sanitizeFilename', () => {
  describe('valid filenames', () => {
    it('should accept simple filenames', () => {
      expect(sanitizeFilename('image.png')).toBe('image.png');
      expect(sanitizeFilename('document.pdf')).toBe('document.pdf');
      expect(sanitizeFilename('file-name.txt')).toBe('file-name.txt');
    });

    it('should accept filenames with spaces', () => {
      expect(sanitizeFilename('my file.jpg')).toBe('my file.jpg');
      expect(sanitizeFilename('file (1).png')).toBe('file (1).png');
    });

    it('should accept filenames with special chars', () => {
      expect(sanitizeFilename('file_name-v2.0.png')).toBe('file_name-v2.0.png');
      expect(sanitizeFilename('image@2x.png')).toBe('image@2x.png');
    });
  });

  describe('path traversal prevention', () => {
    it('should remove parent directory references', () => {
      // path.basename already strips paths, so '../etc/passwd' becomes 'passwd'
      expect(sanitizeFilename('../etc/passwd')).toBe('passwd');
      expect(sanitizeFilename('../../secret.txt')).toBe('secret.txt');
    });

    it('should strip directory paths', () => {
      expect(sanitizeFilename('/etc/passwd')).toBe('passwd');
      expect(sanitizeFilename('usr/bin/evil')).toBe('evil');
      expect(sanitizeFilename('/var/www/index.html')).toBe('index.html');
    });

    it('should handle Windows paths', () => {
      expect(sanitizeFilename('C:\\Windows\\System32\\cmd.exe')).toBe('cmd.exe');
      expect(sanitizeFilename('..\\..\\..\\etc\\passwd')).toBe('passwd');
    });

    it('should handle mixed path separators', () => {
      expect(sanitizeFilename('../../../etc/passwd')).toBe('passwd');
      expect(sanitizeFilename('..\\../etc/passwd')).toBe('passwd');
    });
  });

  describe('null byte injection prevention', () => {
    it('should remove null bytes', () => {
      expect(sanitizeFilename('file\0.txt')).toBe('file.txt');
      expect(sanitizeFilename('evil\0.txt\0')).toBe('evil.txt');
    });

    it('should prevent extension bypass with null bytes', () => {
      // Common attack: "file.txt\0.php" bypasses extension checks
      expect(sanitizeFilename('file.txt\0.php')).toBe('file.txt.php');
    });
  });

  describe('edge cases', () => {
    it('should trim leading/trailing whitespace', () => {
      expect(sanitizeFilename('  file.txt  ')).toBe('file.txt');
      expect(sanitizeFilename('\timage.png\n')).toBe('image.png');
    });

    it('should remove leading dots', () => {
      expect(sanitizeFilename('...file.txt')).toBe('file.txt');
      expect(sanitizeFilename('.hidden')).toBe('hidden');
    });

    it('should handle basename extraction', () => {
      // path.basename already extracted, but test double extraction
      expect(sanitizeFilename('path/to/file.txt')).toBe('file.txt');
    });
  });

  describe('error cases', () => {
    it('should throw on empty string', () => {
      expect(() => sanitizeFilename('')).toThrow('must be a non-empty string');
    });

    it('should throw on non-string input', () => {
      expect(() => sanitizeFilename(null as any)).toThrow('must be a non-empty string');
      expect(() => sanitizeFilename(undefined as any)).toThrow('must be a non-empty string');
      expect(() => sanitizeFilename(123 as any)).toThrow('must be a non-empty string');
    });

    it('should throw when sanitization results in empty', () => {
      expect(() => sanitizeFilename('....')).toThrow('cannot be sanitized');
      expect(() => sanitizeFilename('////')).toThrow('cannot be sanitized');
    });
  });

  describe('real-world attack vectors', () => {
    it('should prevent directory traversal to /etc/passwd', () => {
      const attacks = [
        '../../../../etc/passwd',
        '....//....//....//etc/passwd',
        '..%2F..%2F..%2Fetc%2Fpasswd',
      ];

      attacks.forEach((attack) => {
        const result = sanitizeFilename(attack);
        expect(result).not.toContain('..');
        expect(result).not.toContain('/');
        expect(result).not.toContain('\\');
      });
    });

    it('should prevent Windows system file access', () => {
      const attacks = [
        '..\\..\\..\\Windows\\System32\\config\\SAM',
        'C:\\Windows\\System32\\cmd.exe',
      ];

      attacks.forEach((attack) => {
        const result = sanitizeFilename(attack);
        expect(result).not.toContain('\\');
        expect(result).not.toContain(':');
      });
    });

    it('should prevent hidden file creation', () => {
      // Attackers might try to create .htaccess or .ssh/authorized_keys
      expect(sanitizeFilename('.htaccess')).toBe('htaccess');
      expect(sanitizeFilename('.ssh/authorized_keys')).toBe('authorized_keys');
    });
  });
});
