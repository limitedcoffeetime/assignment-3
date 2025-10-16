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
      const { playerNames, humanPlayerName } = body;

      gameInstance = new MurderMysteryOrchestrator();
      gameInstance.setupGame(playerNames, humanPlayerName);

      return NextResponse.json({
        success: true,
        message: 'Game initialized',
        gameState: {
          alive: gameInstance.gameState.alive,
          phase: gameInstance.gameState.phase
        }
      });
    }

    if (!gameInstance) {
      return NextResponse.json(
        { error: 'Game not initialized' },
        { status: 400 }
      );
    }

    // Day 0: Role assignment and introductions
    if (phase === 'day_0') {
      const humanResponseMap = new Map(Object.entries(humanResponses || {}) as [string, string][]);

      // Send role to each player privately
      const roleMessages = gameInstance.getAgentNames().map(name => ({
        agentName: name,
        message: `Your secret role is: ${gameInstance!.getRole(name).toUpperCase()}. ${
          gameInstance!.getRole(name) === 'murderer'
            ? 'You must eliminate all innocents without being caught. You can lie.'
            : 'You must identify and vote out the murderer. Share what you witness.'
        }\n\nNow introduce yourself to the group in 1-2 sentences.`
      }));

      const responses = await gameInstance!.promptAgents(
        roleMessages,
        humanResponseMap,
        false
      );

      return NextResponse.json({
        phase: 'day_0',
        responses: responses.map(r => ({
          agent: r.agentName,
          role: gameInstance!.getRole(r.agentName), // For display only
          introduction: r.response
        })),
        nextPhase: 'night_1'
      });
    }

    // Night phase
    if (phase?.startsWith('night_')) {
      const humanResponseMap = new Map(Object.entries(humanResponses || {}) as [string, string][]);
      const aliveAgents = gameInstance.gameState.alive;

      // Collect night actions from all alive players
      const nightPrompts = aliveAgents.map(name => {
        const otherPlayers = aliveAgents.filter(n => n !== name);
        const isMurderer = gameInstance!.getRole(name) === 'murderer';

        return {
          agentName: name,
          message: isMurderer
            ? `NIGHT PHASE: Choose your action. You can either "stay home" or "visit another player" (${otherPlayers.join(', ')}). Also specify if you have "intent to kill" (yes/no).`
            : `NIGHT PHASE: Choose your action. You can either "stay home" or "visit another player" (${otherPlayers.join(', ')}).`
        };
      });

      const actionResponses = await gameInstance!.promptAgents(
        nightPrompts,
        humanResponseMap,
        true
      );

      // Interpret each action using LLM
      const nightActions = await Promise.all(
        actionResponses.map(r =>
          gameInstance!.interpretNightAction(r.agentName, r.response)
        )
      );

      // Resolve night
      const result = gameInstance!.resolveNight(nightActions);

      // Send private observations to each player
      const observationMessages: any[] = [];
      aliveAgents.forEach(name => {
        if (result.deaths.includes(name)) return; // Dead players get no message

        // Figure out which location this player was at
        const action = nightActions.find(a => a.agentName === name);
        const locationName = action?.action === 'stay' ? name : action?.target || name;

        const saw = result.observations.get(name) || [];
        let message = `🏠 You were at ${locationName}'s home. `;

        if (saw.length > 0) {
          message += `You saw: ${saw.join(', ')}.`;
        } else {
          message += `You saw no one else.`;
        }

        // Tell murderer if kill was blocked
        if (gameInstance!.getRole(name) === 'murderer' && result.murdererBlocked) {
          message += `\n\n[PRIVATE: Your kill was BLOCKED by 3+ people at the location.]`;
        }

        observationMessages.push({
          agent: name,
          observation: message
        });
      });

      // Check win condition
      const winCheck = gameInstance!.checkWinCondition();

      return NextResponse.json({
        phase,
        nightActions: nightActions.map(a => ({
          agent: a.agentName,
          action: a.action,
          target: a.target,
          intent: a.intent
        })),
        deaths: result.deaths,
        observations: observationMessages,
        winner: winCheck.winner,
        winReason: winCheck.reason,
        nextPhase: winCheck.winner ? null : `day_${gameInstance.gameState.dayNumber + 1}_discussion`
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

      return NextResponse.json({
        phase,
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
        message: `VOTING PHASE: Vote to hang one player, or abstain. Available players: ${aliveAgents.filter(n => n !== name).join(', ')}, or say "abstain".`
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

      // Resolve voting
      const voteResult = gameInstance!.resolveVoting(votes);

      // Check win condition
      const winCheck = gameInstance!.checkWinCondition();

      const dayNum = parseInt(phase.match(/day_(\d+)/)?.[1] || '1');

      return NextResponse.json({
        phase,
        votes: votes.map(v => ({
          agent: v.agentName,
          vote: v.vote
        })),
        voteCounts: Object.fromEntries(voteResult.voteCounts),
        hanged: voteResult.hanged,
        hangedRole: voteResult.role,
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
