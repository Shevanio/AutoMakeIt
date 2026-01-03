import { useState, useCallback, useEffect } from 'react';
import type { MultiAgentAnalysis } from '@automakeit/types';

interface UseMultiAgentAnalysisOptions {
  featureId?: string;
  description?: string;
  projectPath: string;
  onComplete?: (analysis: MultiAgentAnalysis) => void;
  onError?: (error: string) => void;
}

interface AgentProgress {
  id: string;
  name: string;
  icon: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  tasksCount: number;
  duration?: number;
}

export function useMultiAgentAnalysis({
  featureId,
  description,
  projectPath,
  onComplete,
  onError,
}: UseMultiAgentAnalysisOptions) {
  const [isRunning, setIsRunning] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [analysis, setAnalysis] = useState<MultiAgentAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [agentProgress, setAgentProgress] = useState<AgentProgress[]>([]);

  // Initialize agent progress based on default agents
  useEffect(() => {
    if (!hasStarted) {
      setAgentProgress([
        {
          id: 'frontend',
          name: 'Frontend Specialist',
          icon: '🎨',
          status: 'pending',
          tasksCount: 0,
        },
        { id: 'backend', name: 'Backend Specialist', icon: '⚙️', status: 'pending', tasksCount: 0 },
        {
          id: 'database',
          name: 'Database Architect',
          icon: '💾',
          status: 'pending',
          tasksCount: 0,
        },
        { id: 'security', name: 'Security Auditor', icon: '🔒', status: 'pending', tasksCount: 0 },
        { id: 'testing', name: 'Testing Specialist', icon: '🧪', status: 'pending', tasksCount: 0 },
        { id: 'devops', name: 'DevOps Engineer', icon: '🚀', status: 'pending', tasksCount: 0 },
      ]);
    }
  }, [hasStarted]);

  const runAnalysis = useCallback(
    async (options?: { parallel?: boolean; agents?: string[] }) => {
      setIsRunning(true);
      setHasStarted(true);
      setError(null);
      setAnalysis(null);

      try {
        const apiClient = (await import('@/lib/http-api-client')).getHttpApiClient();

        // Call the multi-agent analysis endpoint
        const response = await fetch(`${apiClient['serverUrl']}/api/spec/multi-agent-analyze`, {
          method: 'POST',
          headers: apiClient['getHeaders'](),
          credentials: 'include',
          body: JSON.stringify({
            featureId,
            description,
            projectPath,
            parallel: options?.parallel ?? true,
            agents: options?.agents,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();

        if (result.success && result.analysis) {
          setAnalysis(result.analysis);

          // Update agent progress with completed results
          setAgentProgress((prev) =>
            prev.map((agent) => {
              const agentData = result.analysis.agents.find(
                (a: any) => a.specialization === agent.id
              );
              if (agentData) {
                return {
                  ...agent,
                  status: 'completed' as const,
                  tasksCount: agentData.tasks_identified?.length || 0,
                  duration: agentData.duration_ms
                    ? Math.round(agentData.duration_ms / 1000 / 60)
                    : undefined,
                };
              }
              return agent;
            })
          );

          onComplete?.(result.analysis);
        } else {
          throw new Error(result.error || 'Failed to analyze with multi-agent system');
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
        setError(errorMessage);
        onError?.(errorMessage);

        // Mark all running agents as failed
        setAgentProgress((prev) =>
          prev.map((agent) =>
            agent.status === 'running' ? { ...agent, status: 'failed' as const } : agent
          )
        );
      } finally {
        setIsRunning(false);
      }
    },
    [featureId, projectPath, onComplete, onError]
  );

  const reset = useCallback(() => {
    setIsRunning(false);
    setHasStarted(false);
    setAnalysis(null);
    setError(null);
    setAgentProgress([]);
  }, []);

  return {
    isRunning,
    hasStarted,
    analysis,
    error,
    agentProgress,
    runAnalysis,
    reset,
  };
}
