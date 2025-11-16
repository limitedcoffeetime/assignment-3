import { NextRequest, NextResponse } from 'next/server';
import { MurderMysteryOrchestrator } from '@/lib/orchestrators/MurderMysteryOrchestrator';

/**
 * Murder Mystery Game API
 *
 * Handles all game phases using the reusable GameOrchestrator pattern
 */

// Store game instance in memory (persists in dev mode)
let gameInstance: MurderMysteryOrchestrator | null = null;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, phase, humanResponses } = body;

    // Initialize new game
    if (action === 'init') {
      const { playerNames, humanPlayerName, enabledRoles } = body;

      gameInstance = new MurderMysteryOrchestrator();
      gameInstance.setupGame(playerNames, humanPlayerName, enabledRoles);

      // Get role assignment messages
      const roleMessages = gameInstance.getRoleAssignmentMessages();

      // Send private role assignments to all players with full info
      const roleAssignments = gameInstance.getAgentNames().map(name => ({
        agent: name,
        role: gameInstance!.getRole(name),
        message: roleMessages.get(name) || ''
      }));

      return NextResponse.json({
        success: true,
        message: 'Game initialized',
        gameState: {
          alive: gameInstance.gameState.alive,
          phase: 'night_1' // Skip day_0, go straight to night_1
        },
        roleAssignments
      });
    }

    if (!gameInstance) {
      return NextResponse.json(
        { error: 'Game not initialized' },
        { status: 400 }
      );
    }

    // Night phase
    if (phase?.startsWith('night_')) {
      const humanResponseMap = new Map(Object.entries(humanResponses || {}) as [string, string][]);
      const aliveAgents = gameInstance.gameState.alive;

      // Collect night actions from all alive players
      const nightPrompts = aliveAgents.map(name => {
        const role = gameInstance!.getRoleObject(name);
        const context = {
          agentName: name,
          allPlayers: [...gameInstance!.gameState.alive, ...gameInstance!.gameState.dead],
          alivePlayers: gameInstance!.gameState.alive,
          deadPlayers: gameInstance!.gameState.dead,
          dayNumber: gameInstance!.gameState.dayNumber,
          mustHaveIntent: role.roleName === 'murderer' && gameInstance!.murdererMustHaveIntent()
        };

        const prompt = role.getNightPrompt(context);
        if (!prompt) {
          throw new Error(`Role ${role.roleName} does not have a night action`);
        }

        return {
          agentName: name,
          message: prompt
        };
      });

      const actionResponses = await gameInstance!.promptAgents(
        nightPrompts,
        humanResponseMap,
        true
      );

      // Interpret each action using LLM (returns GameEvent[] per player)
      const allPlayerEvents = await Promise.all(
        actionResponses.map(r =>
          gameInstance!.interpretNightAction(r.agentName, r.response)
        )
      );

      // Resolve night (expects GameEvent[][])
      const result = gameInstance!.resolveNight(allPlayerEvents);

      // Send private observations to each player AND add to their conversation history
      const observationMessages: any[] = [];
      aliveAgents.forEach(name => {
        if (result.deaths.includes(name)) return; // Dead players get no message

        const obs = result.observations.get(name);
        if (!obs) return;

        // Format home name nicely (alice_home -> Alice's home)
        const homeOwner = obs.home.replace('_home', '');
        const homeOwnerCapitalized = homeOwner.charAt(0).toUpperCase() + homeOwner.slice(1);

        // Check if player stayed at their own home
        const stayedHome = homeOwner.toLowerCase() === name.toLowerCase();

        let message = stayedHome
          ? `🏠 You stayed at your home. `
          : `🏠 You were at ${homeOwnerCapitalized}'s home. `;

        if (obs.otherPlayers.length > 0) {
          message += `You saw: ${obs.otherPlayers.join(', ')}.`;
        } else {
          message += `You saw no one else.`;
        }

        // Tell murderer about kill outcome
        if (gameInstance!.getRole(name) === 'murderer') {
          // Find murderer's events
          const murdererEventIndex = actionResponses.findIndex(r => r.agentName === name);
          const murdererEvents = murdererEventIndex >= 0 ? allPlayerEvents[murdererEventIndex] : [];
          const hadKillIntent = murdererEvents.some(e => e.type === 'KILL_INTENT');

          if (hadKillIntent) {
            if (result.murdererBlocked) {
              message += `\n\n[PRIVATE: Since there was more than 1 person present, you did not follow through with your intent to kill.]`;
            } else if (result.deaths.length > 0) {
              // Kill succeeded
              const victim = obs.otherPlayers.find(p => result.deaths.includes(p));
              if (victim) {
                message += `\n\n[PRIVATE: Your kill was successful. ${victim} is dead.]`;
              }
            } else {
              // Had intent but no death - must have been protected
              const potentialVictim = obs.otherPlayers[0]; // Should be only one other person
              if (potentialVictim) {
                message += `\n\n[PRIVATE: Your kill attempt failed. ${potentialVictim} may have been protected.]`;
              }
            }
          }
        }

        // Tell detective about investigation outcome
        if (gameInstance!.getRole(name) === 'detective') {
          const investigation = result.investigations.get(name);
          if (investigation) {
            message += `\n\n[PRIVATE: Investigation Result - ${investigation.target} is: ${investigation.result.toUpperCase()}]`;
          }
        }

        // Tell doctor about protection outcome
        if (gameInstance!.getRole(name) === 'doctor') {
          const protectedPlayer = result.protections.get(name);
          if (protectedPlayer) {
            const wasAttacked = obs.otherPlayers.includes(protectedPlayer) && !result.deaths.includes(protectedPlayer);
            if (wasAttacked && result.deaths.length === 0) {
              message += `\n\n[PRIVATE: You protected ${protectedPlayer}. They may have been targeted tonight - good save!]`;
            } else {
              message += `\n\n[PRIVATE: You protected ${protectedPlayer} tonight.]`;
            }
          }
        }

        // IMPORTANT: Add this observation to the agent's conversation history
        // so they know what they saw when asked to make day statements
        gameInstance!.notifyAgent(name, message);

        observationMessages.push({
          agent: name,
          observation: message,
          home: obs.home // Include raw home location for debugging
        });
      });

      // Broadcast death announcements to all alive agents BEFORE moving to next phase
      // This ensures agents know who died when making their day statements
      const aliveAfterNight = gameInstance.gameState.alive;
      const deathAnnouncement = result.deaths.length > 0
        ? `💀 ${result.deaths.join(', ')} died last night.`
        : `No one died last night.`;

      aliveAfterNight.forEach(agentName => {
        gameInstance!.notifyAgent(agentName, deathAnnouncement);
      });

      // Check win condition
      const winCheck = gameInstance!.checkWinCondition();

      // Check if human player (Finn) died - game over for them
      const humanPlayerDied = result.deaths.includes('Finn');

      // Convert events to UI-friendly format
      const nightActions = allPlayerEvents.map((events, index) => {
        const agentName = actionResponses[index].agentName;
        const moveEvent = events.find(e => e.type === 'MOVE');
        const killIntentEvent = events.find(e => e.type === 'KILL_INTENT');

        return {
          agent: agentName,
          action: moveEvent && 'targetHome' in moveEvent ? 'visit' : 'stay',
          targetHome: moveEvent && 'targetHome' in moveEvent ? moveEvent.targetHome : `${agentName.toLowerCase()}_home`,
          intent: !!killIntentEvent
        };
      });

      return NextResponse.json({
        phase,
        nightPrompts: nightPrompts.map(p => ({ agent: p.agentName, prompt: p.message })),
        nightResponses: actionResponses.map(r => ({
          agent: r.agentName,
          response: r.response,
          reasoning: r.reasoning
        })),
        nightActions,
        deaths: result.deaths,
        observations: observationMessages,
        winner: winCheck.winner || (humanPlayerDied ? 'murderer' : null),
        winReason: winCheck.winner ? winCheck.reason : (humanPlayerDied ? '💀 Unlucky! You died.' : ''),
        humanPlayerDied,
        nextPhase: (winCheck.winner || humanPlayerDied) ? null : `day_${gameInstance.gameState.dayNumber + 1}_discussion`,
        investigations: result.investigations.size > 0 ? Array.from(result.investigations.entries()).map(([detective, inv]) => ({
          detective,
          target: inv.target,
          result: inv.result
        })) : undefined,
        protections: result.protections.size > 0 ? Array.from(result.protections.entries()).map(([doctor, target]) => ({
          doctor,
          target
        })) : undefined
      });
    }

    // Day discussion phase
    if (phase?.includes('_discussion')) {
      const humanResponseMap = new Map(Object.entries(humanResponses || {}) as [string, string][]);
      const aliveAgents = gameInstance.gameState.alive;

      // Each alive player makes a statement
      const statementPrompts = aliveAgents.map(name => ({
        agentName: name,
        message: `DAY DISCUSSION: Make a public statement to the group. You can share what you saw last night, make accusations, or say anything you want. Remember: others may lie!`
      }));

      const statements = await gameInstance!.promptAgents(
        statementPrompts,
        humanResponseMap,
        true
      );

      // IMPORTANT: Broadcast all public statements to all agents so they can use this info for voting
      const publicStatements = statements
        .map(s => `${s.agentName}: "${s.response}"`)
        .join('\n');

      aliveAgents.forEach(agentName => {
        gameInstance!.notifyAgent(
          agentName,
          `📢 PUBLIC STATEMENTS FROM EVERYONE:\n${publicStatements}`
        );
      });

      return NextResponse.json({
        phase,
        discussionPrompts: statementPrompts.map(p => ({ agent: p.agentName, prompt: p.message })),
        statements: statements.map(s => ({
          agent: s.agentName,
          statement: s.response,
          reasoning: s.reasoning
        })),
        nextPhase: phase.replace('_discussion', '_voting')
      });
    }

    // Day voting phase
    if (phase?.includes('_voting')) {
      const humanResponseMap = new Map(Object.entries(humanResponses || {}) as [string, string][]);
      const aliveAgents = gameInstance.gameState.alive;

      // Each alive player votes
      const votePrompts = aliveAgents.map(name => ({
        agentName: name,
        message: `VOTING PHASE: Based on what you've seen last night and what everyone said during the discussion, vote to hang one player, or abstain. Available players: ${aliveAgents.filter(n => n !== name).join(', ')}, or say "abstain".`
      }));

      const voteResponses = await gameInstance!.promptAgents(
        votePrompts,
        humanResponseMap,
        true
      );

      // Interpret votes using LLM
      const votes = await Promise.all(
        voteResponses.map(r =>
          gameInstance!.interpretVote(r.agentName, r.response)
        )
      );

      // Map reasoning back to votes
      const votesWithReasoning = votes.map(v => {
        const response = voteResponses.find(r => r.agentName === v.agentName);
        return {
          ...v,
          reasoning: response?.reasoning || ''
        };
      });

      // Resolve voting
      const voteResult = gameInstance!.resolveVoting(votes);

      // Check win condition
      const winCheck = gameInstance!.checkWinCondition();

      const dayNum = parseInt(phase.match(/day_(\d+)/)?.[1] || '1');

      return NextResponse.json({
        phase,
        votePrompts: votePrompts.map(p => ({ agent: p.agentName, prompt: p.message })),
        votes: votesWithReasoning.map(v => ({
          agent: v.agentName,
          vote: v.vote,
          reasoning: v.reasoning
        })),
        voteCounts: Object.fromEntries(voteResult.voteCounts),
        hanged: voteResult.hanged,
        hangedRole: voteResult.role?.roleName || null,
        winner: winCheck.winner,
        winReason: winCheck.reason,
        nextPhase: winCheck.winner ? null : `night_${dayNum + 1}`
      });
    }

    return NextResponse.json(
      { error: 'Invalid phase' },
      { status: 400 }
    );

  } catch (error: any) {
    console.error('Murder mystery error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process game action' },
      { status: 500 }
    );
  }
}

// Reset game
export async function DELETE() {
  gameInstance = null;
  return NextResponse.json({ success: true, message: 'Game reset' });
}
