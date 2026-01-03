#!/usr/bin/env node
/**
 * Minimal test to reproduce spawn ENOENT issue
 */

import { query } from '@anthropic-ai/claude-agent-sdk';

const options = {
  model: 'claude-sonnet-4-20250514',
  maxTurns: 1,
  cwd: process.cwd(),
  allowedTools: ['Read', 'Glob', 'Grep'],
  systemPrompt: 'You are a helpful assistant.',
  // Test 1: Without pathToClaudeCodeExecutable
  env: process.env,
};

console.log('[TEST] Testing SDK spawn without pathToClaudeCodeExecutable...');
console.log('[TEST] process.execPath:', process.execPath);
console.log('[TEST] PATH:', process.env.PATH?.substring(0, 200));

try {
  const stream = query({
    prompt: 'Say "hello" in one word',
    options,
  });

  let response = '';
  for await (const msg of stream) {
    if (msg.type === 'assistant' && msg.message) {
      for (const block of msg.message.content) {
        if (block.type === 'text') {
          response += block.text;
        }
      }
    }
  }

  console.log('[TEST] ✅ SUCCESS! Response:', response);
} catch (error) {
  console.error('[TEST] ❌ FAILED:', error.message);
  console.error('[TEST] Stack:', error.stack);
  process.exit(1);
}
