/**
 * Tests for logger sanitization of sensitive data
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLogger, setLogLevel, LogLevel } from '../src/logger.js';

describe('logger.ts - Sensitive Data Sanitization', () => {
  // Capture console output
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    setLogLevel(LogLevel.DEBUG);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  describe('API Key Sanitization', () => {
    it('should redact API keys in strings', () => {
      const logger = createLogger('Test');
      logger.info(
        'API key: sk-ant-api03-1234567890abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqrstuvwxyz1234567890abc'
      );

      const loggedArgs = consoleLogSpy.mock.calls[0];
      const loggedString = loggedArgs.join(' ');

      expect(loggedString).toContain('[REDACTED]');
      expect(loggedString).not.toContain('sk-ant-api03-1234567890');
    });

    it('should redact apiKey property in objects', () => {
      const logger = createLogger('Test');
      logger.info({
        apiKey:
          'sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqrstuvwxyz1234567890abc',
      });

      const loggedArgs = consoleLogSpy.mock.calls[0];
      const loggedObject = loggedArgs[1] as Record<string, unknown>;

      expect(loggedObject.apiKey).toBe('[REDACTED]');
    });

    it('should redact api_key property in objects', () => {
      const logger = createLogger('Test');
      logger.info({ api_key: 'secret123456789' });

      const loggedObject = consoleLogSpy.mock.calls[0][1] as Record<string, unknown>;
      expect(loggedObject.api_key).toBe('[REDACTED]');
    });
  });

  describe('Token Sanitization', () => {
    it('should redact bearer tokens', () => {
      const logger = createLogger('Test');
      logger.info(
        'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc'
      );

      const loggedString = consoleLogSpy.mock.calls[0].join(' ');
      expect(loggedString).toContain('[REDACTED]');
      expect(loggedString).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    });

    it('should redact JWT tokens', () => {
      const logger = createLogger('Test');
      logger.info(
        'JWT: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
      );

      const loggedString = consoleLogSpy.mock.calls[0].join(' ');
      expect(loggedString).toContain('[REDACTED]');
      expect(loggedString).not.toContain('SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c');
    });

    it('should redact token property in objects', () => {
      const logger = createLogger('Test');
      logger.info({ token: 'abc123xyz789token' });

      const loggedObject = consoleLogSpy.mock.calls[0][1] as Record<string, unknown>;
      expect(loggedObject.token).toBe('[REDACTED]');
    });

    it('should redact access_token property', () => {
      const logger = createLogger('Test');
      logger.info({ access_token: 'at_1234567890abcdef' });

      const loggedObject = consoleLogSpy.mock.calls[0][1] as Record<string, unknown>;
      expect(loggedObject.access_token).toBe('[REDACTED]');
    });
  });

  describe('Password Sanitization', () => {
    it('should redact password in strings', () => {
      const logger = createLogger('Test');
      logger.info('password: mySecretPassword123!');

      const loggedString = consoleLogSpy.mock.calls[0].join(' ');
      expect(loggedString).toContain('[REDACTED]');
      expect(loggedString).not.toContain('mySecretPassword123!');
    });

    it('should redact password property in objects', () => {
      const logger = createLogger('Test');
      logger.info({ password: 'mySecretPassword123!' });

      const loggedObject = consoleLogSpy.mock.calls[0][1] as Record<string, unknown>;
      expect(loggedObject.password).toBe('[REDACTED]');
    });

    it('should redact secret property in objects', () => {
      const logger = createLogger('Test');
      logger.info({ secret: 'mySecret' });

      const loggedObject = consoleLogSpy.mock.calls[0][1] as Record<string, unknown>;
      expect(loggedObject.secret).toBe('[REDACTED]');
    });
  });

  describe('Authorization Header Sanitization', () => {
    it('should redact authorization header values', () => {
      const logger = createLogger('Test');
      logger.info({ authorization: 'Bearer abc123xyz' });

      const loggedObject = consoleLogSpy.mock.calls[0][1] as Record<string, unknown>;
      expect(loggedObject.authorization).toBe('[REDACTED]');
    });
  });

  describe('Nested Object Sanitization', () => {
    it('should sanitize nested objects', () => {
      const logger = createLogger('Test');
      logger.info({
        user: 'john',
        credentials: {
          apiKey: 'secret123',
          password: 'pass123',
        },
      });

      const loggedObject = consoleLogSpy.mock.calls[0][1] as Record<string, unknown>;
      const credentials = loggedObject.credentials as Record<string, unknown>;

      expect(credentials.apiKey).toBe('[REDACTED]');
      expect(credentials.password).toBe('[REDACTED]');
      expect(loggedObject.user).toBe('john'); // Non-sensitive data preserved
    });

    it('should sanitize arrays with objects', () => {
      const logger = createLogger('Test');
      logger.info([{ apiKey: 'secret1' }, { apiKey: 'secret2' }]);

      const loggedArray = consoleLogSpy.mock.calls[0][1] as Array<Record<string, unknown>>;
      expect(loggedArray[0].apiKey).toBe('[REDACTED]');
      expect(loggedArray[1].apiKey).toBe('[REDACTED]');
    });
  });

  describe('Non-Sensitive Data Preservation', () => {
    it('should preserve non-sensitive strings', () => {
      const logger = createLogger('Test');
      logger.info('This is a normal log message');

      const loggedString = consoleLogSpy.mock.calls[0].join(' ');
      expect(loggedString).toContain('This is a normal log message');
    });

    it('should preserve non-sensitive object properties', () => {
      const logger = createLogger('Test');
      logger.info({ user: 'john', email: 'john@example.com', age: 30 });

      const loggedObject = consoleLogSpy.mock.calls[0][1] as Record<string, unknown>;
      expect(loggedObject.user).toBe('john');
      expect(loggedObject.email).toBe('john@example.com');
      expect(loggedObject.age).toBe(30);
    });

    it('should preserve null and undefined values', () => {
      const logger = createLogger('Test');
      logger.info({ value: null, other: undefined });

      const loggedObject = consoleLogSpy.mock.calls[0][1] as Record<string, unknown>;
      expect(loggedObject.value).toBeNull();
      expect(loggedObject.other).toBeUndefined();
    });
  });

  describe('All Log Levels', () => {
    it('should sanitize error logs', () => {
      const logger = createLogger('Test');
      logger.error('Error with apiKey: secret123456789012345678901');

      const loggedString = consoleErrorSpy.mock.calls[0].join(' ');
      expect(loggedString).toContain('[REDACTED]');
    });

    it('should sanitize warn logs', () => {
      const logger = createLogger('Test');
      logger.warn({ password: 'secretPassword' });

      const loggedObject = consoleWarnSpy.mock.calls[0][1] as Record<string, unknown>;
      expect(loggedObject.password).toBe('[REDACTED]');
    });

    it('should sanitize debug logs', () => {
      const logger = createLogger('Test');
      logger.debug({ token: 'debugToken123456789' });

      const loggedObject = consoleLogSpy.mock.calls[0][2] as Record<string, unknown>;
      expect(loggedObject.token).toBe('[REDACTED]');
    });
  });
});
