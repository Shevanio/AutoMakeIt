import { Bot, Loader2, CheckCircle2, XCircle, Zap } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { HotkeyButton } from '@/components/ui/hotkey-button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { MultiAgentAnalysis } from '@automakeit/types';

interface AgentProgress {
  id: string;
  name: string;
  icon: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  tasksCount: number;
  duration?: number;
}

interface MultiAgentAnalysisModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isRunning: boolean;
  hasStarted: boolean;
  analysis: MultiAgentAnalysis | null;
  error: string | null;
  agentProgress: AgentProgress[];
  onStart: () => void;
  onApply?: (analysis: MultiAgentAnalysis) => void;
}

export function MultiAgentAnalysisModal({
  open,
  onOpenChange,
  isRunning,
  hasStarted,
  analysis,
  error,
  agentProgress,
  onStart,
  onApply,
}: MultiAgentAnalysisModalProps) {
  const isCompleted = hasStarted && !isRunning && analysis !== null;
  const hasFailed = hasStarted && !isRunning && error !== null;

  const completedAgents = agentProgress.filter((a) => a.status === 'completed').length;
  const totalAgents = agentProgress.length;
  const progressPercentage = totalAgents > 0 ? (completedAgents / totalAgents) * 100 : 0;

  const getStatusIcon = (status: AgentProgress['status']) => {
    switch (status) {
      case 'pending':
        return <div className="w-5 h-5 rounded-full border-2 border-muted" />;
      case 'running':
        return <Loader2 className="w-5 h-5 animate-spin text-primary" />;
      case 'completed':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-destructive" />;
    }
  };

  const getComplexityColor = (score: number) => {
    if (score >= 8) return 'text-red-500';
    if (score >= 5) return 'text-amber-500';
    return 'text-green-500';
  };

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'high':
        return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'medium':
        return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      default:
        return 'bg-green-500/10 text-green-500 border-green-500/20';
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        if (!open && !isRunning) {
          onOpenChange(false);
        }
      }}
    >
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="w-5 h-5" />
            Multi-Agent Spec Analysis
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Deploy 6 specialized AI agents to document your application from multiple perspectives:
            Frontend, Backend, Database, Security, Testing, and DevOps.
          </DialogDescription>
        </DialogHeader>

        {/* Initial State - Not Started */}
        {!hasStarted && (
          <div className="py-8 space-y-4">
            <div className="text-center">
              <Bot className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">Ready to Document</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Six specialized agents will work in parallel to create comprehensive architectural
                documentation covering all aspects of your application.
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-w-2xl mx-auto">
              {agentProgress.map((agent) => (
                <div
                  key={agent.id}
                  className="p-3 rounded-lg border border-border bg-muted/20 text-center"
                >
                  <div className="text-2xl mb-1">{agent.icon}</div>
                  <div className="text-xs font-medium">{agent.name}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Running State */}
        {isRunning && (
          <div className="py-6 space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Progress: {completedAgents} of {totalAgents} agents completed
                </span>
                <span className="font-medium">{Math.round(progressPercentage)}%</span>
              </div>
              <Progress value={progressPercentage} className="h-2" />
            </div>

            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
              {agentProgress.map((agent) => (
                <div
                  key={agent.id}
                  className={cn(
                    'p-4 rounded-lg border transition-all',
                    agent.status === 'running'
                      ? 'border-primary bg-primary/5'
                      : agent.status === 'completed'
                        ? 'border-green-500/20 bg-green-500/5'
                        : 'border-border bg-muted/20'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="text-2xl">{agent.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-medium">{agent.name}</h4>
                        {agent.status === 'running' && (
                          <Badge variant="outline" className="text-xs">
                            Analyzing...
                          </Badge>
                        )}
                      </div>
                      {agent.status === 'completed' && agent.tasksCount > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {agent.tasksCount} summar{agent.tasksCount !== 1 ? 'ies' : 'y'} documented
                        </p>
                      )}
                    </div>
                    {getStatusIcon(agent.status)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Completed State */}
        {isCompleted && analysis && (
          <div className="space-y-6 overflow-y-auto pr-2 max-h-[500px]">
            {/* Overall Summary */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-lg border border-border bg-muted/20 text-center">
                <div className="text-2xl font-bold text-primary">
                  {analysis.combined_steps.length}
                </div>
                <div className="text-xs text-muted-foreground mt-1">Components Documented</div>
              </div>
              <div className="p-4 rounded-lg border border-border bg-muted/20 text-center">
                <div className="text-2xl font-bold text-primary">
                  {analysis.metadata.successful_agents}/{analysis.metadata.agents_used}
                </div>
                <div className="text-xs text-muted-foreground mt-1">Agents Completed</div>
              </div>
            </div>

            {/* Agent Results */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Zap className="w-4 h-4" />
                Agent Insights
              </h3>
              {analysis.agents.map((agent) => (
                <details
                  key={agent.specialization}
                  className="group rounded-lg border border-border bg-muted/20"
                >
                  <summary className="p-4 cursor-pointer list-none flex items-center gap-3 hover:bg-muted/30 transition-colors">
                    <div className="text-2xl">{agent.agent_icon || '🤖'}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">
                        {agent.agent_name || agent.specialization}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {agent.tasks_identified?.length || 0} summar
                        {(agent.tasks_identified?.length || 0) !== 1 ? 'ies' : 'y'}
                      </div>
                    </div>
                    <div className="text-muted-foreground group-open:rotate-180 transition-transform">
                      ▼
                    </div>
                  </summary>
                  <div className="p-4 pt-0 space-y-3 border-t border-border">
                    {agent.tasks_identified && agent.tasks_identified.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold mb-2 text-muted-foreground">
                          Architecture Summaries
                        </h4>
                        <ul className="space-y-1.5">
                          {agent.tasks_identified.map((task) => (
                            <li key={task.id} className="text-sm flex gap-2">
                              <span className="text-muted-foreground">•</span>
                              <span>{task.title}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {agent.insights && agent.insights.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold mb-2 text-muted-foreground">
                          Key Insights
                        </h4>
                        <ul className="space-y-1.5">
                          {agent.insights.map((insight, idx) => (
                            <li key={idx} className="text-sm flex gap-2">
                              <span className="text-primary">💡</span>
                              <span>{insight}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {agent.warnings && agent.warnings.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold mb-2 text-amber-500">Warnings</h4>
                        <ul className="space-y-1.5">
                          {agent.warnings.map((warning, idx) => (
                            <li key={idx} className="text-sm flex gap-2">
                              <span className="text-amber-500">⚠️</span>
                              <span>{warning}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </details>
              ))}
            </div>
          </div>
        )}

        {/* Error State */}
        {hasFailed && (
          <div className="py-8 text-center">
            <XCircle className="w-16 h-16 mx-auto mb-4 text-destructive" />
            <h3 className="text-lg font-semibold mb-2">Analysis Failed</h3>
            <p className="text-sm text-destructive max-w-md mx-auto">{error}</p>
          </div>
        )}

        <DialogFooter>
          <div className="flex gap-2 w-full justify-between">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isRunning}>
              {isCompleted ? 'Close' : 'Cancel'}
            </Button>

            {!hasStarted && (
              <HotkeyButton
                onClick={onStart}
                disabled={isRunning}
                hotkey={{ key: 'Enter', cmdCtrl: true }}
                hotkeyActive={open && !isRunning}
              >
                <Bot className="w-4 h-4 mr-2" />
                Start Analysis
              </HotkeyButton>
            )}

            {isCompleted && onApply && (
              <HotkeyButton
                onClick={() => {
                  if (analysis) {
                    onApply(analysis);
                    onOpenChange(false);
                  }
                }}
                hotkey={{ key: 'Enter', cmdCtrl: true }}
                hotkeyActive={open}
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Apply Spec
              </HotkeyButton>
            )}

            {hasFailed && (
              <Button onClick={onStart}>
                <Loader2 className="w-4 h-4 mr-2" />
                Retry
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
