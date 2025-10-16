/**
 * Singleton game instance manager
 * Maintains game state across HTTP requests
 */

import { NewMurderGameChat } from './NewMurderGameChat';

// Global game instance (persists across requests in development)
let gameInstance: NewMurderGameChat | null = null;

export function getGameInstance(): NewMurderGameChat {
  if (!gameInstance) {
    gameInstance = new NewMurderGameChat();
  }
  return gameInstance;
}

export function resetGameInstance(): void {
  if (gameInstance) {
    gameInstance.reset();
  }
  gameInstance = null;
}
