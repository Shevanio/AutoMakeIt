/**
 * Settings Types - Re-exported from @automakeit/types
 *
 * This file now re-exports settings types from the shared @automakeit/types package
 * to maintain backward compatibility with existing imports in the server codebase.
 */

export type {
  ThemeMode,
  KanbanCardDetailLevel,
  AgentModel,
  PlanningMode,
  ThinkingLevel,
  ModelProvider,
  KeyboardShortcuts,
  AIProfile,
  ProjectRef,
  TrashedProjectRef,
  ChatSessionRef,
  GlobalSettings,
  Credentials,
  BoardBackgroundSettings,
  WorktreeInfo,
  ProjectSettings,
} from '@automakeit/types';

export {
  DEFAULT_KEYBOARD_SHORTCUTS,
  DEFAULT_GLOBAL_SETTINGS,
  DEFAULT_CREDENTIALS,
  DEFAULT_PROJECT_SETTINGS,
  SETTINGS_VERSION,
  CREDENTIALS_VERSION,
  PROJECT_SETTINGS_VERSION,
} from '@automakeit/types';
