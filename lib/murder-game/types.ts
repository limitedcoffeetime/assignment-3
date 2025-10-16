/**
 * Type definitions for the Murder Mystery Multi-Agent Game
 */

export type Role = 'innocent' | 'murderer';

export type GamePhase =
  | 'INIT'
  | 'DAY_0_INTRO'
  | 'NIGHT'
  | 'DAY_DISCUSSION'
  | 'DAY_VOTING';

export type NightActionType = 'stay_home' | 'visit';

export interface NightAction {
  playerId: string;
  action: NightActionType;
  targetPlayerId?: string;  // Required if action is 'visit'
  intentToKill?: boolean;   // Only murderer provides this
}

export interface Fact {
  type: 'location' | 'death' | 'role_reveal';
  night?: number;
  day?: number;
  content: string;
}

export interface AllegedInfo {
  speaker: string;
  day: number;
  content: string;
}

export interface PlayerState {
  playerId: string;
  role: Role | null;
  isAlive: boolean;
  facts: Fact[];
  allegedInfo: AllegedInfo[];
}

export interface DeadPlayer {
  playerId: string;
  diedNight: number;
  role: Role;
}

export interface MurderAttempt {
  night: number;
  victim?: string;
  blocked: boolean;
  successful: boolean;
}

export interface GameState {
  phase: GamePhase;
  nightNumber: number;
  dayNumber: number;
  roles: Map<string, Role>;
  playerStates: Map<string, PlayerState>;
  deadPlayers: DeadPlayer[];
  murderHistory: MurderAttempt[];
  lastNoKillNight: number | null;  // Track when murderer last didn't attempt kill
  gameOver: boolean;
  winner?: 'innocents' | 'murderer';
}

export interface RoleAssignment {
  roles: Map<string, Role>;
}

export interface LocationGroup {
  locationOwnerId: string;
  presentPlayers: string[];
}

export interface NightResult {
  locations: LocationGroup[];
  deaths: { victimId: string, location: string }[];
  blocked: boolean;
  newFacts: Map<string, Fact[]>;  // playerId -> facts they learned
  murdererNotification?: 'kill_success' | 'kill_blocked' | null;
}

export interface Vote {
  voterId: string;
  targetId: string | 'abstain';
}

export interface VotingResult {
  result: 'hanged' | 'no_consensus';
  hangedPlayer?: string;
  hangedRole?: Role;
  voteTally: Map<string, number>;
  gameOver: boolean;
  winner?: 'innocents' | 'murderer';
}

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
