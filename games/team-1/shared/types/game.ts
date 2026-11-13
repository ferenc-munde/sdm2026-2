// Player state for network synchronization
export interface PlayerState {
  id: string;
  x: number;
  y: number;
  direction: 'up' | 'down' | 'left' | 'right';
  isMoving: boolean;
  inventory: InventoryItem[];
}

export interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
}

// Game state shared across all players
export interface GameState {
  players: Map<string, PlayerState>;
  trainCondition: number;
  timeRemaining: number;
  gameStatus: 'lobby' | 'active' | 'won' | 'lost';
}
