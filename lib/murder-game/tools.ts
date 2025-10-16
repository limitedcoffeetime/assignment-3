/**
 * Deterministic game logic tools for the Murder Mystery Game
 * These are NOT LLM-generated - they use pure logic
 */

import {
  Role,
  RoleAssignment,
  NightAction,
  NightResult,
  Vote,
  VotingResult,
  LocationGroup,
  Fact,
} from './types';

/**
 * Randomly assigns one murderer and the rest as innocents
 */
export function assignRoles(playerIds: string[]): RoleAssignment {
  if (playerIds.length < 2) {
    throw new Error('Need at least 2 players to assign roles');
  }

  const roles = new Map<string, Role>();

  // Randomly select one player to be the murderer
  const murdererIndex = Math.floor(Math.random() * playerIds.length);

  playerIds.forEach((playerId, index) => {
    roles.set(playerId, index === murdererIndex ? 'murderer' : 'innocent');
  });

  return { roles };
}

/**
 * Resolves all night actions and determines deaths, blocked kills, and new facts
 */
export function resolveNightActions(
  actions: NightAction[],
  roles: Map<string, Role>,
  nightNumber: number
): NightResult {
  // Step 1: Determine final locations for all players
  const locations = new Map<string, string[]>(); // locationOwnerId -> players there
  const playerLocations = new Map<string, string>(); // playerId -> where they ended up

  actions.forEach((action) => {
    const finalLocation = action.action === 'stay_home'
      ? action.playerId
      : action.targetPlayerId!;

    if (!locations.has(finalLocation)) {
      locations.set(finalLocation, []);
    }
    locations.get(finalLocation)!.push(action.playerId);
    playerLocations.set(action.playerId, finalLocation);
  });

  // Step 2: Determine if any kills occur
  const deaths: { victimId: string; location: string }[] = [];
  let killBlocked = false;
  let murdererNotification: 'kill_success' | 'kill_blocked' | null = null;

  // Find the murderer's action
  const murdererAction = actions.find(
    (action) => roles.get(action.playerId) === 'murderer'
  );

  if (murdererAction && murdererAction.intentToKill) {
    const murdererLocation = playerLocations.get(murdererAction.playerId)!;
    const playersAtLocation = locations.get(murdererLocation)!;

    if (playersAtLocation.length >= 3) {
      // Kill blocked due to witnesses
      killBlocked = true;
      murdererNotification = 'kill_blocked';
    } else if (playersAtLocation.length === 2) {
      // Kill succeeds - find the victim (the other person at location)
      const victimId = playersAtLocation.find(
        (id) => id !== murdererAction.playerId
      )!;
      deaths.push({ victimId, location: murdererLocation });
      murdererNotification = 'kill_success';
    } else {
      // Murderer is alone (stayed home, no visitors)
      // No kill occurs, no notification needed
      murdererNotification = null;
    }
  }

  // Step 3: Generate facts for each player about who they saw
  const newFacts = new Map<string, Fact[]>();

  locations.forEach((playersAtLocation, locationOwnerId) => {
    playersAtLocation.forEach((playerId) => {
      if (!newFacts.has(playerId)) {
        newFacts.set(playerId, []);
      }

      // Generate fact about who this player saw
      const otherPlayers = playersAtLocation.filter((id) => id !== playerId);

      if (otherPlayers.length > 0) {
        const fact: Fact = {
          type: 'location',
          night: nightNumber,
          content: `Night ${nightNumber}: I was at ${locationOwnerId}'s location. Also present: ${otherPlayers.join(', ')}.`,
        };
        newFacts.get(playerId)!.push(fact);
      } else {
        const fact: Fact = {
          type: 'location',
          night: nightNumber,
          content: `Night ${nightNumber}: I was alone at ${locationOwnerId}'s location.`,
        };
        newFacts.get(playerId)!.push(fact);
      }
    });
  });

  // Step 4: Format location groups for output
  const locationGroups: LocationGroup[] = [];
  locations.forEach((presentPlayers, locationOwnerId) => {
    locationGroups.push({ locationOwnerId, presentPlayers });
  });

  return {
    locations: locationGroups,
    deaths,
    blocked: killBlocked,
    newFacts,
    murdererNotification,
  };
}

/**
 * Resolves voting and determines if someone is hanged
 * Uses 50% + 1 of non-abstaining votes, minimum 2 votes
 */
export function resolveVoting(
  votes: Vote[],
  alivePlayers: string[],
  roles: Map<string, Role>
): VotingResult {
  // Count votes
  const voteTally = new Map<string, number>();
  let abstainCount = 0;

  votes.forEach((vote) => {
    if (vote.targetId === 'abstain') {
      abstainCount++;
    } else {
      voteTally.set(vote.targetId, (voteTally.get(vote.targetId) || 0) + 1);
    }
  });

  const nonAbstainVotes = votes.length - abstainCount;
  const requiredVotes = Math.max(2, Math.floor(nonAbstainVotes / 2) + 1);

  // Find player with most votes
  let maxVotes = 0;
  let hangedPlayer: string | undefined;
  let isTie = false;

  voteTally.forEach((count, playerId) => {
    if (count > maxVotes) {
      maxVotes = count;
      hangedPlayer = playerId;
      isTie = false;
    } else if (count === maxVotes && count > 0) {
      isTie = true;
    }
  });

  // Check if hanging succeeds
  if (!hangedPlayer || isTie || maxVotes < requiredVotes) {
    return {
      result: 'no_consensus',
      voteTally,
      gameOver: false,
    };
  }

  const hangedRole = roles.get(hangedPlayer)!;

  // Check end conditions after hanging
  const remainingAlive = alivePlayers.filter((id) => id !== hangedPlayer);
  const remainingInnocents = remainingAlive.filter(
    (id) => roles.get(id) === 'innocent'
  ).length;
  const remainingMurderers = remainingAlive.filter(
    (id) => roles.get(id) === 'murderer'
  ).length;

  let gameOver = false;
  let winner: 'innocents' | 'murderer' | undefined;

  if (hangedRole === 'murderer') {
    // Innocents win if murderer is hanged
    gameOver = true;
    winner = 'innocents';
  } else if (remainingInnocents === 1 && remainingMurderers === 1) {
    // 1v1 after hanging an innocent - murderer wins
    gameOver = true;
    winner = 'murderer';
  } else if (remainingInnocents === 0) {
    // All innocents dead - murderer wins
    gameOver = true;
    winner = 'murderer';
  }

  return {
    result: 'hanged',
    hangedPlayer,
    hangedRole,
    voteTally,
    gameOver,
    winner,
  };
}

/**
 * Check if murderer violated the "must kill every other night" rule
 */
export function checkMurdererKillConstraint(
  lastNoKillNight: number | null,
  currentNight: number,
  intentToKill: boolean
): { valid: boolean; message?: string } {
  if (intentToKill) {
    // Murderer is attempting to kill, no constraint violation
    return { valid: true };
  }

  // Murderer is NOT attempting to kill
  if (lastNoKillNight !== null && currentNight - lastNoKillNight === 1) {
    // Murderer didn't kill last night and is trying to not kill again
    return {
      valid: false,
      message: 'You must attempt a kill at least every other night. You did not kill last night, so you must attempt a kill tonight.',
    };
  }

  return { valid: true };
}
