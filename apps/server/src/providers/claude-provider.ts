/**
 * Claude Provider - Executes queries using Claude Agent SDK
 *
 * Wraps the @anthropic-ai/claude-agent-sdk for seamless integration
 * with the provider architecture.
 */

import { query, type Options } from '@anthropic-ai/claude-agent-sdk';
import { BaseProvider } from './base-provider.js';
import { classifyError, getUserFriendlyErrorMessage } from '@automakeit/utils';
import type {
  ExecuteOptions,
  ProviderMessage,
  InstallationStatus,
  ModelDefinition,
} from './types.js';

export class ClaudeProvider extends BaseProvider {
  getName(): string {
    return 'claude';
  }

  /**
   * Execute a query using Claude Agent SDK
   */
  async *executeQuery(options: ExecuteOptions): AsyncGenerator<ProviderMessage> {
    const {
      prompt,
      model,
      cwd,
      systemPrompt,
      maxTurns = 20,
      allowedTools,
      abortController,
      conversationHistory,
      sdkSessionId,
    } = options;

    // Build Claude SDK options
    // MCP permission logic - determines how to handle tool permissions when MCP servers are configured.
    // This logic mirrors buildMcpOptions() in sdk-options.ts but is applied here since
    // the provider is the final point where SDK options are constructed.
    const hasMcpServers = options.mcpServers && Object.keys(options.mcpServers).length > 0;
    // Default to true for autonomous workflow. Security is enforced when adding servers
    // via the security warning dialog that explains the risks.
    const mcpAutoApprove = options.mcpAutoApproveTools ?? true;
    const mcpUnrestricted = options.mcpUnrestrictedTools ?? true;
    const defaultTools = ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash', 'WebSearch', 'WebFetch'];

    // Determine permission mode based on settings
    const shouldBypassPermissions = hasMcpServers && mcpAutoApprove;
    // Determine if we should restrict tools (only when no MCP or unrestricted is disabled)
    const shouldRestrictTools = !hasMcpServers || !mcpUnrestricted;

    const sdkOptions: Options = {
      model,
      systemPrompt,
      maxTurns,
      cwd,
      // Let SDK use its own cli.js by default (don't override pathToClaudeCodeExecutable)
      // Pass environment to subprocess
      env: process.env as Record<string, string | undefined>,
      // Only restrict tools if explicitly set OR (no MCP / unrestricted disabled)
      ...(allowedTools && shouldRestrictTools && { allowedTools }),
      ...(!allowedTools && shouldRestrictTools && { allowedTools: defaultTools }),
      // When MCP servers are configured and auto-approve is enabled, use bypassPermissions
      permissionMode: shouldBypassPermissions ? 'bypassPermissions' : 'default',
      // Required when using bypassPermissions mode
      ...(shouldBypassPermissions && { allowDangerouslySkipPermissions: true }),
      abortController,
      // Resume existing SDK session if we have a session ID
      ...(sdkSessionId && conversationHistory && conversationHistory.length > 0
        ? { resume: sdkSessionId }
        : {}),
      // Forward settingSources for CLAUDE.md file loading
      ...(options.settingSources && { settingSources: options.settingSources }),
      // Forward sandbox configuration
      ...(options.sandbox && { sandbox: options.sandbox }),
      // Forward MCP servers configuration
      ...(options.mcpServers && { mcpServers: options.mcpServers }),
    };

    // Build prompt payload
    let promptPayload: string | AsyncIterable<any>;

    if (Array.isArray(prompt)) {
      // Multi-part prompt (with images)
      promptPayload = (async function* () {
        const multiPartPrompt = {
          type: 'user' as const,
          session_id: '',
          message: {
            role: 'user' as const,
            content: prompt,
          },
          parent_tool_use_id: null,
        };
        yield multiPartPrompt;
      })();
    } else {
      // Simple text prompt
      promptPayload = prompt;
    }

    // Execute via Claude Agent SDK
    try {
      // DEBUG: Log ALL SDK options being passed
      console.log(
        '[ClaudeProvider] FULL SDK OPTIONS:',
        JSON.stringify(
          {
            model: sdkOptions.model,
            cwd: sdkOptions.cwd,
            systemPrompt:
              typeof sdkOptions.systemPrompt === 'string'
                ? sdkOptions.systemPrompt.substring(0, 100)
                : sdkOptions.systemPrompt,
            maxTurns: sdkOptions.maxTurns,
            allowedTools: sdkOptions.allowedTools,
            permissionMode: sdkOptions.permissionMode,
            allowDangerouslySkipPermissions: sdkOptions.allowDangerouslySkipPermissions,
            settingSources: sdkOptions.settingSources,
          },
          null,
          2
        )
      );

      const stream = query({ prompt: promptPayload, options: sdkOptions });

      // Stream messages directly - they're already in the correct format
      for await (const msg of stream) {
        yield msg as ProviderMessage;
      }
    } catch (error) {
      // Enhance error with user-friendly message and classification
      const errorInfo = classifyError(error);
      const userMessage = getUserFriendlyErrorMessage(error);

      console.error('[ClaudeProvider] executeQuery() error during execution:', {
        type: errorInfo.type,
        message: errorInfo.message,
        isRateLimit: errorInfo.isRateLimit,
        retryAfter: errorInfo.retryAfter,
        stack: (error as Error).stack,
      });

      // Build enhanced error message with additional guidance for rate limits
      const message = errorInfo.isRateLimit
        ? `${userMessage}\n\nTip: If you're running multiple features in auto-mode, consider reducing concurrency (maxConcurrency setting) to avoid hitting rate limits.`
        : userMessage;

      const enhancedError = new Error(message);
      (enhancedError as any).originalError = error;
      (enhancedError as any).type = errorInfo.type;

      if (errorInfo.isRateLimit) {
        (enhancedError as any).retryAfter = errorInfo.retryAfter;
      }

      throw enhancedError;
    }
  }

  /**
   * Detect Claude SDK installation (always available via npm)
   */
  async detectInstallation(): Promise<InstallationStatus> {
    // Claude SDK is always available since it's a dependency
    const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

    const status: InstallationStatus = {
      installed: true,
      method: 'sdk',
      hasApiKey,
      authenticated: hasApiKey,
    };

    return status;
  }

  /**
   * Get available Claude models
   */
  getAvailableModels(): ModelDefinition[] {
    const models = [
      {
        id: 'claude-opus-4-5-20251101',
        name: 'Claude Opus 4.5',
        modelString: 'claude-opus-4-5-20251101',
        provider: 'anthropic',
        description: 'Most capable Claude model',
        contextWindow: 200000,
        maxOutputTokens: 16000,
        supportsVision: true,
        supportsTools: true,
        tier: 'premium' as const,
        default: true,
      },
      {
        id: 'claude-sonnet-4-20250514',
        name: 'Claude Sonnet 4',
        modelString: 'claude-sonnet-4-20250514',
        provider: 'anthropic',
        description: 'Balanced performance and cost',
        contextWindow: 200000,
        maxOutputTokens: 16000,
        supportsVision: true,
        supportsTools: true,
        tier: 'standard' as const,
      },
      {
        id: 'claude-3-5-sonnet-20241022',
        name: 'Claude 3.5 Sonnet',
        modelString: 'claude-3-5-sonnet-20241022',
        provider: 'anthropic',
        description: 'Fast and capable',
        contextWindow: 200000,
        maxOutputTokens: 8000,
        supportsVision: true,
        supportsTools: true,
        tier: 'standard' as const,
      },
      {
        id: 'claude-haiku-4-5-20251001',
        name: 'Claude Haiku 4.5',
        modelString: 'claude-haiku-4-5-20251001',
        provider: 'anthropic',
        description: 'Fastest Claude model',
        contextWindow: 200000,
        maxOutputTokens: 8000,
        supportsVision: true,
        supportsTools: true,
        tier: 'basic' as const,
      },
    ] satisfies ModelDefinition[];
    return models;
  }

  /**
   * Check if the provider supports a specific feature
   */
  supportsFeature(feature: string): boolean {
    const supportedFeatures = ['tools', 'text', 'vision', 'thinking'];
    return supportedFeatures.includes(feature);
  }
}
