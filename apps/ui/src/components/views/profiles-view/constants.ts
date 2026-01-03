import {
  Brain,
  Zap,
  Scale,
  Cpu,
  Rocket,
  Sparkles,
  Palette,
  Settings,
  Database,
  Lock,
  TestTube,
} from 'lucide-react';
import type { AgentModel, ThinkingLevel } from '@/store/app-store';

// Icon mapping for profiles
export const PROFILE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Brain,
  Zap,
  Scale,
  Cpu,
  Rocket,
  Sparkles,
  Palette,
  Settings,
  Database,
  Lock,
  TestTube,
};

// Available icons for selection
export const ICON_OPTIONS = [
  { name: 'Brain', icon: Brain },
  { name: 'Zap', icon: Zap },
  { name: 'Scale', icon: Scale },
  { name: 'Cpu', icon: Cpu },
  { name: 'Rocket', icon: Rocket },
  { name: 'Sparkles', icon: Sparkles },
  { name: 'Palette', icon: Palette },
  { name: 'Settings', icon: Settings },
  { name: 'Database', icon: Database },
  { name: 'Lock', icon: Lock },
  { name: 'TestTube', icon: TestTube },
];

// Model options for the form
export const CLAUDE_MODELS: { id: AgentModel; label: string }[] = [
  { id: 'haiku', label: 'Claude Haiku' },
  { id: 'sonnet', label: 'Claude Sonnet' },
  { id: 'opus', label: 'Claude Opus' },
];

export const THINKING_LEVELS: { id: ThinkingLevel; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
  { id: 'ultrathink', label: 'Ultrathink' },
];
