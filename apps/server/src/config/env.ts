/**
 * Centralized environment variable configuration
 * All env var parsing happens here for consistency and type safety
 */

export interface ServerConfig {
  // Server basics
  port: number;
  dataDir: string;
  enableRequestLogging: boolean;

  // CORS
  corsOrigin?: string;

  // Security
  allowedRootDirectory?: string;
  terminalMaxSessions: number;

  // Model overrides (for testing/development)
  models: {
    spec?: string;
    features?: string;
    suggestions?: string;
    chat?: string;
    auto?: string;
    default?: string;
  };

  // Testing
  mockAgent: boolean;
}

/**
 * Get environment variable with fallback support
 * Tries new AUTOMAKEIT_* variable first, then falls back to legacy AUTOMAKER_*
 *
 * @param newName - New variable name (AUTOMAKEIT_*)
 * @param oldName - Legacy variable name (AUTOMAKER_*)
 * @returns Variable value or undefined
 */
function getEnvWithFallback(newName: string, oldName: string): string | undefined {
  const newValue = process.env[newName];
  const oldValue = process.env[oldName];

  // If using legacy variable, log deprecation warning once
  if (!newValue && oldValue) {
    console.warn(
      `[DEPRECATED] ${oldName} is deprecated and will be removed in v3.0.0. Use ${newName} instead.`
    );
  }

  return newValue || oldValue;
}

/**
 * Parse and validate environment variables
 * Provides defaults and type safety for all server configuration
 *
 * @returns Validated server configuration object
 */
export function loadServerConfig(): ServerConfig {
  return {
    // Server basics
    port: parseInt(process.env.PORT || '3008', 10),
    dataDir: process.env.DATA_DIR || './data',
    enableRequestLogging: process.env.ENABLE_REQUEST_LOGGING !== 'false',

    // CORS
    corsOrigin: process.env.CORS_ORIGIN,

    // Security
    allowedRootDirectory: process.env.ALLOWED_ROOT_DIRECTORY,
    terminalMaxSessions: parseInt(process.env.TERMINAL_MAX_SESSIONS || '1000', 10),

    // Model overrides
    models: {
      spec: getEnvWithFallback('AUTOMAKEIT_MODEL_SPEC', 'AUTOMAKER_MODEL_SPEC'),
      features: getEnvWithFallback('AUTOMAKEIT_MODEL_FEATURES', 'AUTOMAKER_MODEL_FEATURES'),
      suggestions: getEnvWithFallback(
        'AUTOMAKEIT_MODEL_SUGGESTIONS',
        'AUTOMAKER_MODEL_SUGGESTIONS'
      ),
      chat: getEnvWithFallback('AUTOMAKEIT_MODEL_CHAT', 'AUTOMAKER_MODEL_CHAT'),
      auto: getEnvWithFallback('AUTOMAKEIT_MODEL_AUTO', 'AUTOMAKER_MODEL_AUTO'),
      default: getEnvWithFallback('AUTOMAKEIT_MODEL_DEFAULT', 'AUTOMAKER_MODEL_DEFAULT'),
    },

    // Testing
    mockAgent: getEnvWithFallback('AUTOMAKEIT_MOCK_AGENT', 'AUTOMAKER_MOCK_AGENT') === 'true',
  };
}

/**
 * Validate server configuration
 * Throws descriptive errors if configuration is invalid
 *
 * @param config - Server configuration to validate
 * @throws Error if configuration is invalid
 */
export function validateServerConfig(config: ServerConfig): void {
  // Validate port
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
    throw new Error(`Invalid PORT: ${config.port}. Must be between 1-65535.`);
  }

  // Validate terminal max sessions
  if (!Number.isInteger(config.terminalMaxSessions) || config.terminalMaxSessions < 1) {
    throw new Error(
      `Invalid TERMINAL_MAX_SESSIONS: ${config.terminalMaxSessions}. Must be positive integer.`
    );
  }

  // Validate data directory is not empty
  if (!config.dataDir || config.dataDir.trim() === '') {
    throw new Error('DATA_DIR cannot be empty');
  }
}

// Export singleton instance
let _config: ServerConfig | null = null;

/**
 * Get the current server configuration (lazy loaded)
 * Configuration is loaded once and cached
 *
 * @returns Validated server configuration
 */
export function getServerConfig(): ServerConfig {
  if (!_config) {
    _config = loadServerConfig();
    validateServerConfig(_config);
  }
  return _config;
}

/**
 * Reset configuration (for testing purposes)
 * Forces reload on next getServerConfig() call
 */
export function resetServerConfig(): void {
  _config = null;
}
