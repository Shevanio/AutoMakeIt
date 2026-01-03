/**
 * Prompts for Multi-Agent Spec Generation
 */

/**
 * Builds the analysis prompt for a specialized agent
 */
export function buildMultiAgentAnalysisPrompt(params: {
  agentFocus: string;
  featureTitle: string;
  featureDescription: string;
  projectContext?: string;
}): string {
  const { agentFocus, featureTitle, featureDescription, projectContext } = params;

  return `# Application Documentation Request

You are documenting an existing software application from the perspective of: **${agentFocus}**

${projectContext ? `## Project Context\n${projectContext}\n` : ''}

## Application to Document

**Title**: ${featureTitle}

**Scope**:
${featureDescription}

## Your Task

As a ${agentFocus} expert, DOCUMENT and ANALYZE the current state of this application from your domain perspective.

**CRITICAL WORKFLOW**:
1. **Explore** (5-10 tool calls max): Use Glob/Read/Grep to understand current architecture and implementation
2. **Analyze** (mentally): Based on what you found, understand the current system design and patterns
3. **Respond** (immediately): Output the JSON documenting what EXISTS (not what should be built)

⚠️ **BE EFFICIENT**: You have limited turns. Focus on understanding WHAT IS ALREADY IMPLEMENTED, not what needs to be built.

### Your Documentation Should Include:

**ONLY 1-2 HIGH-LEVEL ARCHITECTURE SUMMARIES** (NOT a list of every component!)

For each summary section:
1. **title**: High-level area name (e.g., "Authentication & Authorization System", "Frontend State Management Architecture")
2. **description**: COMPREHENSIVE summary (2-4 sentences) covering:
   - Overall architecture pattern and design decisions
   - Key technologies and frameworks used
   - Major components and how they interact
   - Notable implementation details and file locations
3. **key_files**: Array of 3-8 MOST IMPORTANT files that implement this architecture
4. **technologies**: Array of key libraries/frameworks used in this area

### Also Provide:

- **insights**: Array of 2-4 KEY ARCHITECTURAL INSIGHTS about how the current system works (not suggestions for improvement, but important design decisions that were made)
- **warnings**: Array of 2-4 NOTABLE LIMITATIONS or technical debt in the current implementation (document existing issues, don't propose solutions)
- **dependencies**: Array of external libraries or services that ARE CURRENTLY USED in this domain

### Guidelines:

- Document what EXISTS, not what should be built
- Focus on CURRENT architecture, patterns, and implementation
- Be specific about actual file names, paths, and technical details found in the code
- Describe HOW things currently work, not how they should work
- Document existing error handling, validation, and logging approaches
- If something doesn't exist yet, simply don't include it (don't create tasks for it)

## Output Format

You MUST respond with ONLY a JSON code block in this exact format (nothing before, nothing after):

\`\`\`json
{
  "architecture_summary": [
    {
      "title": "Authentication & Authorization System",
      "description": "The application implements a dual authentication architecture supporting both Electron (API keys) and Web (session cookies) modes. API keys are generated using crypto.randomBytes(32) and stored in DATA_DIR/.api-key with 0o600 permissions. Session tokens persist to disk in DATA_DIR/.sessions for recovery across restarts. The auth middleware (apps/server/src/middleware/auth.ts) validates requests using timing-safe comparison. WebSocket connections use ephemeral connection tokens with 5-minute expiry generated via createWsConnectionToken(). The dual-mode architecture creates complexity: Electron uses IPC header-based auth while web mode uses traditional HTTP cookies.",
      "key_files": [
        "apps/server/src/middleware/auth.ts",
        "apps/server/src/lib/auth-utils.ts",
        "apps/server/tests/unit/middleware/auth.test.ts"
      ],
      "technologies": ["express@^5.0.0", "cookie-parser@^1.4.6", "crypto.timingSafeEqual"]
    }
  ],
  "insights": [
    "The authentication system separates API key generation (crypto.randomBytes) from session management, allowing different lifetime policies for different auth methods",
    "Session persistence to disk (instead of memory-only) enables session recovery across server restarts, but creates security considerations for multi-user deployments"
  ],
  "warnings": [
    "API keys are currently printed to console on startup (suppressible via AUTOMAKER_HIDE_API_KEY env var) which could leak credentials in production logs",
    "When ALLOWED_ROOT_DIRECTORY is not configured, the system allows unrestricted filesystem access - this is a critical security issue for production deployments"
  ],
  "dependencies": [
    "express@^5.0.0",
    "cookie-parser@^1.4.6",
    "ws@^8.18.0"
  ]
}
\`\`\`

CRITICAL RULES:
1. Your response must START with \`\`\`json and END with \`\`\`
2. Do NOT add any text before or after the JSON code block
3. Use the Read, Glob, and Grep tools to analyze the EXISTING code EFFICIENTLY (5-10 tool calls max)
4. The JSON must be valid and parseable
5. Include ONLY 1-2 sections in the architecture_summary array (high-level summaries, NOT granular components)
6. Each summary should be 2-4 sentences describing WHAT EXISTS and HOW IT WORKS
7. Focus on ARCHITECTURAL PATTERNS and DESIGN DECISIONS, not implementation details
8. Include 2-4 insights about KEY ARCHITECTURAL DECISIONS in the current system
9. Include 2-4 warnings about EXISTING LIMITATIONS or technical debt (document problems, don't propose solutions)`;
}

/**
 * Builds a prompt for combining multiple agent analyses into a single spec
 */
export function buildSpecCombinationPrompt(params: {
  featureTitle: string;
  featureDescription: string;
  agentAnalyses: Array<{
    agent_name: string;
    tasks: Array<{ title: string; description: string }>;
    insights: string[];
  }>;
}): string {
  const { featureTitle, featureDescription, agentAnalyses } = params;

  const analysesText = agentAnalyses
    .map(
      (analysis) => `
### ${analysis.agent_name}

Tasks identified:
${analysis.tasks.map((t, idx) => `${idx + 1}. ${t.title}`).join('\n')}

Key insights:
${analysis.insights.map((i) => `- ${i}`).join('\n')}
`
    )
    .join('\n---\n');

  return `# Spec Combination Task

You need to combine multiple specialized agent analyses into a single, coherent implementation spec.

## Feature

**Title**: ${featureTitle}
**Description**: ${featureDescription}

## Agent Analyses

${analysesText}

## Your Task

Create a logical execution order for all tasks, considering:

1. **Dependencies**: Database changes before backend, backend before frontend
2. **Risk**: High-risk tasks should be identified
3. **Parallelization**: Tasks that can run in parallel
4. **Logical flow**: Natural implementation sequence

Return the tasks in execution order with these fields:
- order: Sequential number (1, 2, 3...)
- task_id: Reference to original task
- agent_source: Which agent identified this
- parallel_group: Tasks with same number can run in parallel (optional)

Output JSON:
\`\`\`json
{
  "execution_order": [
    {
      "order": 1,
      "task_id": "database-task-1",
      "agent_source": "Database Agent",
      "parallel_group": null
    }
  ],
  "estimated_total_hours": 12.5,
  "complexity_score": 7,
  "risk_level": "medium"
}
\`\`\``;
}
