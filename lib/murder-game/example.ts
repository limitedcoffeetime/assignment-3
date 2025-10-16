/**
 * Example usage of the Murder Mystery Game
 * This demonstrates how to set up and run a game
 */

import { PlayerAgent } from './PlayerAgent';
import { UserAgent, UserInputHandler } from './UserAgent';
import { GameMasterOrchestrator } from './GameMasterOrchestrator';
import { Role, Fact, AllegedInfo, NightAction } from './types';

/**
 * Example console-based input handler for the user
 * In a real app, you'd replace this with a web UI
 */
class ConsoleUserInputHandler implements UserInputHandler {
  async getIntroduction(): Promise<string> {
    // In a real implementation, you'd get this from stdin or a web form
    return "Hi everyone! I'm excited to play. Let's find the murderer!";
  }

  async getNightAction(
    nightNumber: number,
    alivePlayers: string[],
    role: Role,
    facts: Fact[],
    allegedInfo: AllegedInfo[],
    mustKill?: boolean
  ): Promise<NightAction> {
    // In a real implementation, you'd prompt the user and parse their input
    console.log('\n=== YOUR TURN ===');
    console.log(`Role: ${role.toUpperCase()}`);
    console.log(`Night: ${nightNumber}`);
    console.log(`Alive players: ${alivePlayers.join(', ')}`);

    if (mustKill) {
      console.log('⚠️ You MUST attempt a kill tonight!');
    }

    console.log('\nYour Facts:');
    facts.forEach(f => console.log(`  - ${f.content}`));

    console.log('\nAlleged Info:');
    allegedInfo.forEach(a => console.log(`  - ${a.speaker}: ${a.content}`));

    // For this example, return a simple action
    // In real app, you'd get this from user input
    return {
      playerId: 'user',
      action: 'stay_home',
      intentToKill: role === 'murderer' && (mustKill || Math.random() > 0.5),
    };
  }

  async getStatement(
    dayNumber: number,
    recentDeaths: string[],
    facts: Fact[],
    allegedInfo: AllegedInfo[],
    murdererKillBlocked?: boolean
  ): Promise<string> {
    console.log('\n=== YOUR TURN TO SPEAK ===');
    console.log(`Day: ${dayNumber}`);

    if (recentDeaths.length > 0) {
      console.log(`Recent deaths: ${recentDeaths.join(', ')}`);
    }

    if (murdererKillBlocked) {
      console.log('🔪 (Private) Your kill was blocked!');
    }

    console.log('\nYour Facts:');
    facts.forEach(f => console.log(`  - ${f.content}`));

    console.log('\nAlleged Info:');
    allegedInfo.forEach(a => console.log(`  - ${a.speaker}: ${a.content}`));

    // In real app, get this from user input
    return "I stayed home last night and didn't see anyone.";
  }

  async getVote(
    dayNumber: number,
    alivePlayers: string[],
    facts: Fact[],
    allegedInfo: AllegedInfo[]
  ): Promise<string | 'abstain'> {
    console.log('\n=== YOUR TURN TO VOTE ===');
    console.log(`Day: ${dayNumber}`);
    console.log(`Alive players: ${alivePlayers.join(', ')}`);

    console.log('\nYour Facts:');
    facts.forEach(f => console.log(`  - ${f.content}`));

    console.log('\nAlleged Info:');
    allegedInfo.forEach(a => console.log(`  - ${a.speaker}: ${a.content}`));

    // In real app, get this from user input
    return alivePlayers[0] || 'abstain';
  }
}

/**
 * Main function to run the game
 */
export async function runExampleGame() {
  console.log('🎮 Murder Mystery Game - Example\n');

  // Create 3 LLM agents with different personalities
  const agent1 = new PlayerAgent({
    playerId: 'Alice',
    personalityPrompt: 'You are Alice, a detective who is analytical and observant. You speak formally and logically.',
  });

  const agent2 = new PlayerAgent({
    playerId: 'Bob',
    personalityPrompt: 'You are Bob, a friendly and trusting person who tends to see the best in others.',
  });

  const agent3 = new PlayerAgent({
    playerId: 'Charlie',
    personalityPrompt: 'You are Charlie, a suspicious and cautious person who questions everything.',
  });

  // Create user agent
  const userInputHandler = new ConsoleUserInputHandler();
  const userAgent = new UserAgent('You', userInputHandler);

  // Create orchestrator
  const orchestrator = new GameMasterOrchestrator({
    llmAgents: [agent1, agent2, agent3],
    userAgent,
  });

  // Start the game
  await orchestrator.startGame();

  // Game will run until completion
  if (orchestrator.isGameOver()) {
    const winner = orchestrator.getWinner();
    console.log(`\n🎉 Final Result: ${winner?.toUpperCase()} WIN!\n`);
  }
}

// Uncomment to run the example
// runExampleGame().catch(console.error);
