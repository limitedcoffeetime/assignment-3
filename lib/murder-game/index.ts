/**
 * Murder Mystery Multi-Agent Game
 *
 * A murder mystery game where context isolation between agents is key.
 * The orchestrator manages game flow and ensures information is distributed correctly.
 */

export * from './types';
export * from './tools';

// Old system (deprecated)
export * from './PlayerAgent';
export * from './UserAgent';
export * from './GameMasterOrchestrator';
export * from './ChatUserInputHandler';
export * from './MurderGameChatOrchestrator';

// New LLM-based system
export * from './OrchestratorLLM';
export * from './SimpleLLMAgent';
export * from './NewMurderGameChat';

export { getGameInstance, resetGameInstance } from './gameInstance';
