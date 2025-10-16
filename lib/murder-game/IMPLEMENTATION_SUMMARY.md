# Murder Mystery Game - Implementation Summary

## What We Built

A fully functional multi-agent murder mystery game with strict context isolation, following the orchestrator-workers pattern from Anthropic's "Building Effective Agents" guide.

## Files Created

### Core Types (`types.ts`)
- **GameState**: Complete game state tracking
- **Role**: 'innocent' | 'murderer'
- **GamePhase**: Tracks current phase (INIT, DAY_0, NIGHT, DAY_DISCUSSION, DAY_VOTING)
- **NightAction**: Player's night choice
- **Fact**: Things players witnessed directly (100% true)
- **AllegedInfo**: Things players heard from others (may be lies)
- **Various Result Types**: For tool outputs

### Deterministic Tools (`tools.ts`)
Three pure functions that handle all game logic without LLM involvement:

1. **`assignRoles(playerIds)`**
   - Randomly assigns 1 murderer, rest innocent
   - Returns role mapping

2. **`resolveNightActions(actions, roles, nightNumber)`**
   - Groups players by location
   - Determines if kills succeed or are blocked
   - Generates facts for each player about who they saw
   - Returns deaths, locations, facts, and murderer notification

3. **`resolveVoting(votes, alivePlayers, roles)`**
   - Counts votes with 50% + 1 threshold (minimum 2)
   - Handles abstentions
   - Checks end conditions
   - Returns result, hanged player, and game over status

4. **`checkMurdererKillConstraint()`**
   - Validates murderer can't skip kills two nights in a row

### Player Agent (`PlayerAgent.ts`)
LLM-powered agent that plays the game:

- **Maintains isolated state**: role, facts, alleged info, conversation history
- **Makes decisions**:
  - `makeIntroduction()`: Day 0 intro
  - `chooseNightAction()`: Where to go, intent to kill
  - `makeStatement()`: Day discussion
  - `vote()`: Voting phase
- **Context management**: Builds knowledge summary for LLM
- **Response parsing**: Extracts structured data from LLM responses
- **Gemini integration**: Properly separates system instructions from conversation

### User Agent (`UserAgent.ts`)
Human player interface:

- **Same interface as PlayerAgent** for consistency
- **Delegates to UserInputHandler**: Allows flexible UI implementation
- **State tracking**: Facts and alleged info
- **No LLM calls**: Gets decisions from human

### Game Master Orchestrator (`GameMasterOrchestrator.ts`)
The central orchestrator that manages everything:

#### Key Responsibilities:
1. **Role Assignment**: Calls `assignRoles()` tool, privately notifies each agent
2. **Information Distribution**: Carefully sends facts/alleged info to correct agents
3. **Phase Management**: Coordinates game flow
4. **Context Isolation**: Ensures no information leakage

#### Game Flow Implementation:
```
startGame()
  ↓
runIntroductions()
  - Collect intros from all players
  - Distribute as alleged info (excluding self)
  ↓
runNightPhase()
  - Collect actions from alive players
  - Call resolveNightActions() tool
  - Distribute facts to each player
  - Check end condition (all innocents dead)
  ↓
runDayPhase()
  - Announce deaths (NOT roles)
  - Collect statements from alive players
  - Distribute statements as alleged info
  ↓
runVotingPhase()
  - Collect votes from alive players
  - Call resolveVoting() tool
  - Announce result with role reveal
  - Check end conditions
  ↓
Back to runNightPhase() or Game Over
```

## Key Design Decisions

### 1. Context Isolation Strategy
- Each agent has separate conversation history
- Orchestrator never leaks tool results to wrong agents
- Facts vs Alleged Info distinction
- Private notifications (role assignment, kill blocked)

### 2. Deterministic Tools
- Game logic is predictable and testable
- No LLM bias in rule enforcement
- Clear separation of concerns

### 3. Scalable Architecture
- Easy to add more agents (just add to llmAgents array)
- Configurable personalities per agent
- UserInputHandler interface allows any UI

### 4. Clean Interfaces
```typescript
// All agents (LLM or human) have same interface:
interface Agent {
  playerId: string;
  role: Role | null;
  isAlive: boolean;
  facts: Fact[];
  allegedInfo: AllegedInfo[];

  makeIntroduction(): Promise<string>;
  chooseNightAction(...): Promise<NightAction>;
  makeStatement(...): Promise<string>;
  vote(...): Promise<string | 'abstain'>;
}
```

### 5. Type Safety
- Full TypeScript coverage
- Prevents common bugs
- Better IDE support

## Game Balance

### Voting Threshold
- 50% + 1 of non-abstaining votes
- Minimum 2 votes required
- Allows strategic abstaining
- Prevents single-player control

### Murderer Constraints
- Must attempt kill at least every other night
- Prevents infinite stalling
- Allows trust-building nights
- Tracked via `lastNoKillNight`

### End Conditions
1. Murderer hanged → Innocents win
2. All innocents dead → Murderer wins
3. 1v1 situation → Murderer wins (instant)

### Information Reveals
- Night deaths: Name only (role hidden)
- Hangings: Name + Role (feedback needed)
- Location facts: Who was where
- No mind reading: Can't know others' intents

## Example Usage

```typescript
// Create agents
const agents = [
  new PlayerAgent({ playerId: 'Alice', personalityPrompt: 'Analytical detective' }),
  new PlayerAgent({ playerId: 'Bob', personalityPrompt: 'Friendly and trusting' }),
  new PlayerAgent({ playerId: 'Charlie', personalityPrompt: 'Suspicious and cautious' })
];

// Create user agent
const userAgent = new UserAgent('Player', inputHandler);

// Create orchestrator
const orchestrator = new GameMasterOrchestrator({
  llmAgents: agents,
  userAgent
});

// Start game
await orchestrator.startGame();
```

## Future Enhancements

### Easy Additions:
- More players (just add to array)
- Different personalities (change personalityPrompt)
- Custom voting thresholds (modify resolveVoting)
- Multiple murderers (modify assignRoles)

### Advanced Features:
- Special roles (detective, doctor, vigilante)
- Items/abilities
- Day/night time limits
- Spectator mode
- Game replay
- Statistics tracking
- Web UI integration

## Testing Considerations

### Unit Tests:
- Test each tool function independently
- Test with different player counts
- Test edge cases (ties, all abstain, etc.)

### Integration Tests:
- Mock LLM responses
- Test full game flows
- Test context isolation

### Manual Testing:
- Run with real LLMs
- Verify no information leakage
- Check game balance
- Test UI/UX

## Performance Notes

### LLM Calls:
- Introductions: 4 parallel calls
- Night actions: 4 sequential calls (can't parallelize - need different contexts)
- Statements: N sequential calls (N = alive players)
- Voting: N sequential calls

### Optimization Opportunities:
- Cache LLM responses for identical contexts
- Batch similar prompts
- Use faster model for simple decisions
- Pre-generate responses for common scenarios

## Conclusion

This implementation provides a solid foundation for a murder mystery multi-agent game with proper context isolation. The architecture is clean, scalable, and follows best practices from Anthropic's multi-agent patterns.

The system is ready to be integrated into a web application with a proper UI for the UserInputHandler.
