/**
 * Multi-Agent Spec Generation Types
 *
 * System where specialized AI agents analyze a feature from different perspectives
 * (frontend, backend, database, security, testing, devops) and collaboratively
 * generate a comprehensive implementation spec.
 */

// Multi-agent spec types are independent of Feature type to avoid circular dependencies

/**
 * Specialization areas for agents
 */
export type AgentSpecialization =
  | 'frontend' // UI/UX, components, state management
  | 'backend' // API design, business logic, data processing
  | 'database' // Schema design, migrations, queries
  | 'security' // Auth, authorization, vulnerabilities, data protection
  | 'testing' // Test strategy, unit/integration/E2E tests
  | 'devops'; // Deployment, CI/CD, monitoring, infrastructure

/**
 * Configuration for a specialized agent
 */
export interface SpecializationAgent {
  name: string; // e.g., "Frontend Agent"
  icon: string; // Emoji for UI display
  specialization: AgentSpecialization;
  focus: string; // Short description of focus area
  systemPrompt: string; // System prompt for Claude
  model?: string; // Optional: specific model for this agent
}

/**
 * Status of an agent's analysis
 */
export type AgentAnalysisStatus =
  | 'pending' // Not started yet
  | 'running' // Currently analyzing
  | 'completed' // Successfully completed
  | 'failed'; // Analysis failed

/**
 * A task identified by a specialized agent
 */
export interface AgentTask {
  id: string; // Unique ID for this task
  title: string; // Short description
  description: string; // Detailed instructions
  estimated_duration_mins: number; // Estimated time to complete
  priority?: 'low' | 'medium' | 'high'; // Task priority

  // File changes
  files_to_create?: string[]; // New files to create
  files_to_modify?: string[]; // Existing files to modify

  // Testing requirements
  tests_required?: string[]; // Test files needed

  // Dependencies
  depends_on?: string[]; // IDs of tasks this depends on

  // Metadata
  complexity?: number; // 1-10 complexity score
  agent_notes?: string; // Additional context from agent
}

/**
 * Result of a single agent's analysis
 */
export interface AgentAnalysis {
  agent_name: string; // Name of the agent
  agent_icon: string; // Icon for UI
  specialization: AgentSpecialization;
  status: AgentAnalysisStatus;

  // Analysis results
  tasks_identified: AgentTask[]; // Tasks found by this agent
  insights: string[]; // Key insights and recommendations
  warnings: string[]; // Potential issues or risks
  dependencies: string[]; // External dependencies needed

  // Timing
  started_at?: string; // ISO timestamp
  completed_at?: string; // ISO timestamp
  duration_ms?: number; // Total duration in milliseconds

  // Error info (if failed)
  error?: string; // Error message if status === 'failed'
}

/**
 * Step in the combined spec (from SpecStep type - simplified here to avoid circular deps)
 */
export interface CombinedSpecStep {
  id: string;
  order: number;
  title: string;
  description: string;
  estimated_duration_mins?: number;
  files_to_create?: string[];
  files_to_modify?: string[];
  tests_required?: string[];
  agent_source: AgentSpecialization; // Which agent identified this step
  agent_notes?: string;
}

/**
 * Metadata about the combined spec
 */
export interface CombinedSpecMetadata {
  total_tasks: number;
  total_duration_mins: number;
  complexity_score: number; // 1-10
  risk_level: 'low' | 'medium' | 'high';
  agents_used: number;
  successful_agents: number;
  failed_agents: number;
}

/**
 * Complete multi-agent analysis result
 */
export interface MultiAgentAnalysis {
  feature_id: string;
  feature_title: string;
  feature_description: string;

  // Agent analyses
  agents: AgentAnalysis[];

  // Combined spec
  combined_steps: CombinedSpecStep[];
  metadata: CombinedSpecMetadata;

  // Overall timing
  started_at: string;
  completed_at: string;
  total_duration_ms: number;
}

/**
 * Request to start multi-agent analysis
 */
export interface MultiAgentAnalysisRequest {
  feature_id: string;
  agents?: AgentSpecialization[]; // Optional: specify which agents to use
  model?: string; // Optional: override default model
  parallel?: boolean; // Run agents in parallel (default: true)
}

/**
 * Progress event during multi-agent analysis
 */
export interface MultiAgentProgressEvent {
  feature_id: string;
  agent_name: string;
  status: AgentAnalysisStatus;
  progress?: number; // 0-100
  message?: string;
}

/**
 * Default agent configurations
 */
export const DEFAULT_AGENTS: SpecializationAgent[] = [
  {
    name: 'Frontend Agent',
    icon: '🎨',
    specialization: 'frontend',
    focus: 'UI/UX, components, state management, user interactions',
    systemPrompt: `You are a frontend expert specializing in React, TypeScript, and modern UI patterns.
Your role is to analyze features from a UI/UX perspective and identify all frontend tasks needed.

Focus on:
- UI components to create or modify
- State management requirements (local state, global state, server state)
- User interactions and event handling
- Form validation and data input
- Responsive design and accessibility
- Performance optimizations (lazy loading, code splitting)
- Error states and loading states
- Navigation and routing changes

For each task, be specific about component structure, props, and integration points.`,
  },
  {
    name: 'Backend Agent',
    icon: '⚙️',
    specialization: 'backend',
    focus: 'API design, business logic, data processing, integrations',
    systemPrompt: `You are a backend expert specializing in Node.js, Express, and API design.
Your role is to analyze features from a backend/API perspective and identify all server-side tasks.

Focus on:
- API endpoints (REST/GraphQL) to create or modify
- Request validation and sanitization
- Business logic implementation
- Data transformation and processing
- Third-party API integrations
- Background jobs and scheduled tasks
- Caching strategies
- Error handling and logging
- Rate limiting and throttling

For each task, specify HTTP methods, request/response formats, and error codes.`,
  },
  {
    name: 'Database Agent',
    icon: '🗄️',
    specialization: 'database',
    focus: 'Schema design, migrations, queries, indexes, data integrity',
    systemPrompt: `You are a database expert specializing in relational and document databases.
Your role is to analyze features from a data persistence perspective.

Focus on:
- Schema changes (new tables, columns, collections)
- Migration scripts (up and down migrations)
- Indexes for query performance
- Foreign keys and relationships
- Data validation constraints
- Query optimization
- Data backfilling for existing records
- Backup and rollback strategies

For each task, provide SQL/NoSQL schema definitions and consider data migration implications.`,
  },
  {
    name: 'Security Agent',
    icon: '🔒',
    specialization: 'security',
    focus: 'Authentication, authorization, data protection, vulnerability prevention',
    systemPrompt: `You are a security expert specializing in web application security.
Your role is to analyze features from a security perspective and identify risks and requirements.

Focus on:
- Authentication mechanisms (login, session management, tokens)
- Authorization rules (who can access what, RBAC, ABAC)
- Input validation and sanitization (XSS, SQL injection prevention)
- Data encryption (at rest and in transit)
- Secure API design (CORS, CSRF protection)
- Rate limiting and DDoS protection
- Security headers and CSP
- Audit logging for sensitive operations
- GDPR/privacy compliance

For each task, identify potential vulnerabilities and recommend security best practices.`,
  },
  {
    name: 'Testing Agent',
    icon: '🧪',
    specialization: 'testing',
    focus: 'Test strategy, unit tests, integration tests, E2E tests, edge cases',
    systemPrompt: `You are a QA expert specializing in automated testing strategies.
Your role is to analyze features and define comprehensive test coverage.

Focus on:
- Unit tests for business logic
- Integration tests for API endpoints
- E2E tests for user flows
- Edge cases and error scenarios
- Performance tests for critical paths
- Security tests (auth, input validation)
- Accessibility tests
- Test data setup and teardown
- Mock strategies for external dependencies

For each task, specify test scenarios, expected outcomes, and test data requirements.`,
  },
  {
    name: 'DevOps Agent',
    icon: '🚀',
    specialization: 'devops',
    focus: 'Deployment, CI/CD, monitoring, infrastructure, scalability',
    systemPrompt: `You are a DevOps expert specializing in cloud deployment and operational excellence.
Your role is to analyze features from an infrastructure and deployment perspective.

Focus on:
- Infrastructure changes (servers, services, resources)
- Environment variables and configuration
- CI/CD pipeline updates
- Database migration execution in production
- Monitoring and alerting setup
- Logging and observability
- Scaling and performance considerations
- Rollback and disaster recovery plans
- Documentation for deployment

For each task, consider production deployment implications and operational requirements.`,
  },
];
