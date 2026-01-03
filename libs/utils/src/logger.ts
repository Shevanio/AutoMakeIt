/**
 * Simple logger utility with log levels
 * Configure via LOG_LEVEL environment variable: error, warn, info, debug
 * Defaults to 'info' if not set
 */

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

const LOG_LEVEL_NAMES: Record<string, LogLevel> = {
  error: LogLevel.ERROR,
  warn: LogLevel.WARN,
  info: LogLevel.INFO,
  debug: LogLevel.DEBUG,
};

let currentLogLevel: LogLevel = LogLevel.INFO;

// Initialize log level from environment variable
const envLogLevel = process.env.LOG_LEVEL?.toLowerCase();
if (envLogLevel && LOG_LEVEL_NAMES[envLogLevel] !== undefined) {
  currentLogLevel = LOG_LEVEL_NAMES[envLogLevel];
}

/**
 * Create a logger instance with a context prefix
 *
 * All log output is automatically sanitized to prevent sensitive data leakage.
 * Respects LOG_LEVEL environment variable (error, warn, info, debug).
 *
 * @param context - Context name to prefix all log messages (e.g., 'Terminal', 'AutoMode')
 * @returns Logger object with error, warn, info, debug methods
 * @example
 * ```typescript
 * const logger = createLogger('MyService');
 *
 * logger.info('Server started');
 * logger.warn('High memory usage');
 * logger.error('Failed to connect:', error);
 * logger.debug('Request details:', { method: 'GET', url: '/api' });
 *
 * // Sensitive data is automatically redacted
 * logger.info('API key:', 'sk-ant-abc123'); // Logs: "API key: [REDACTED]"
 * ```
 */
export function createLogger(context: string) {
  const prefix = `[${context}]`;

  return {
    error: (...args: unknown[]): void => {
      if (currentLogLevel >= LogLevel.ERROR) {
        const sanitized = sanitizeArgs(args);
        console.error(prefix, ...sanitized);
      }
    },

    warn: (...args: unknown[]): void => {
      if (currentLogLevel >= LogLevel.WARN) {
        const sanitized = sanitizeArgs(args);
        console.warn(prefix, ...sanitized);
      }
    },

    info: (...args: unknown[]): void => {
      if (currentLogLevel >= LogLevel.INFO) {
        const sanitized = sanitizeArgs(args);
        console.log(prefix, ...sanitized);
      }
    },

    debug: (...args: unknown[]): void => {
      if (currentLogLevel >= LogLevel.DEBUG) {
        const sanitized = sanitizeArgs(args);
        console.log(prefix, '[DEBUG]', ...sanitized);
      }
    },
  };
}

/**
 * Get the current log level
 *
 * @returns Current log level (ERROR=0, WARN=1, INFO=2, DEBUG=3)
 * @example
 * ```typescript
 * const level = getLogLevel();
 * if (level >= LogLevel.DEBUG) {
 *   console.log('Debug logging enabled');
 * }
 * ```
 */
export function getLogLevel(): LogLevel {
  return currentLogLevel;
}

/**
 * Set the log level programmatically (useful for testing)
 *
 * @param level - Log level to set (ERROR=0, WARN=1, INFO=2, DEBUG=3)
 * @example
 * ```typescript
 * // Enable debug logging
 * setLogLevel(LogLevel.DEBUG);
 *
 * // Silence all but errors
 * setLogLevel(LogLevel.ERROR);
 * ```
 */
export function setLogLevel(level: LogLevel): void {
  currentLogLevel = level;
}

/**
 * Patterns for sensitive data that should be redacted from logs
 */
const SENSITIVE_PATTERNS = {
  // API keys (various formats)
  apiKey: /\b(api[_-]?key|apikey|key)["\s:=]+([a-zA-Z0-9_\-]{20,})/gi,
  // Anthropic API keys specifically (sk-ant-...)
  anthropicKey: /\b(sk-ant-[a-zA-Z0-9_\-]{95,})/gi,
  // Bearer tokens
  bearerToken: /\b(bearer\s+)([a-zA-Z0-9_\-.]+)/gi,
  // JWT tokens
  jwtToken: /\b(eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+)/gi,
  // Generic tokens
  token: /\b(token|access_token|refresh_token)["\s:=]+([a-zA-Z0-9_\-]{20,})/gi,
  // Passwords
  password: /\b(password|passwd|pwd)["\s:=]+([^\s"',}]{8,})/gi,
  // Authorization headers
  authHeader: /\b(authorization["\s:=]+)([^\s"',}]+)/gi,
};

/**
 * Sanitize sensitive data from a value before logging
 * Recursively sanitizes objects and arrays
 */
function sanitizeValue(value: unknown): unknown {
  // Null/undefined passthrough
  if (value === null || value === undefined) {
    return value;
  }

  // Handle strings - apply regex patterns
  if (typeof value === 'string') {
    let sanitized = value;

    // Replace API keys
    sanitized = sanitized.replace(SENSITIVE_PATTERNS.apiKey, '$1="[REDACTED]"');

    // Replace Anthropic keys specifically
    sanitized = sanitized.replace(SENSITIVE_PATTERNS.anthropicKey, '[REDACTED]');

    // Replace bearer tokens
    sanitized = sanitized.replace(SENSITIVE_PATTERNS.bearerToken, '$1[REDACTED]');

    // Replace JWT tokens
    sanitized = sanitized.replace(SENSITIVE_PATTERNS.jwtToken, '[REDACTED]');

    // Replace generic tokens
    sanitized = sanitized.replace(SENSITIVE_PATTERNS.token, '$1="[REDACTED]"');

    // Replace passwords
    sanitized = sanitized.replace(SENSITIVE_PATTERNS.password, '$1="[REDACTED]"');

    // Replace authorization headers
    sanitized = sanitized.replace(SENSITIVE_PATTERNS.authHeader, '$1[REDACTED]');

    return sanitized;
  }

  // Handle arrays - recursively sanitize elements
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }

  // Handle objects - recursively sanitize properties
  if (typeof value === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      // Redact entire value if key name suggests sensitive data
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('password') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('token') ||
        lowerKey.includes('apikey') ||
        lowerKey.includes('api_key') ||
        lowerKey.includes('authorization')
      ) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = sanitizeValue(val);
      }
    }
    return sanitized;
  }

  // Other primitives (number, boolean) passthrough
  return value;
}

/**
 * Sanitize all arguments before logging
 * Protects against accidental logging of sensitive data
 */
function sanitizeArgs(args: unknown[]): unknown[] {
  return args.map((arg) => sanitizeValue(arg));
}
