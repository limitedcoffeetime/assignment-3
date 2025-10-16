# Murder Mystery Game - Usage Guide

## 🎮 How to Play

The murder mystery game is now fully integrated into your webchat UI! All game information is displayed through text messages in the conversation.

### Starting the Game

1. **Run the development server:**
   ```bash
   npm run dev
   ```

2. **Open the app:** Navigate to `http://localhost:3000`

3. **Switch to Murder Game mode:** Click the "Murder Game" button at the top

4. **Start playing:** Type "start game" and press Send

### Game Flow

The game will guide you through each phase with text prompts. Here's what to expect:

#### 1. Day 0: Introductions
```
🎭 Day 0: Introductions

Introduce yourself to the other players in 2-3 sentences. Be creative!

Type your introduction:
```

**Example response:** "Hi everyone! I'm a software engineer who loves solving puzzles. Let's work together to find the murderer!"

#### 2. Night Phase
```
🌙 Night 1

Your Role: INNOCENT (or MURDERER)

Your Facts (things you witnessed):
• [Your facts will appear here]

Alleged Info (things others claimed - may be lies):
• [Statements from other players]

Choose your action:
1. Stay home
2. Visit [player]

Available players: Alice, Bob, Charlie

Format:
• "stay"
• "visit Alice"

Type your action:
```

**For Innocents:**
- Type: `stay` to stay home
- Type: `visit Alice` to visit Alice's house

**For Murderer (additional options):**
- Type: `stay kill` to stay home with intent to kill
- Type: `stay nokill` to stay home without killing intent
- Type: `visit Alice kill` to visit with intent to kill
- Type: `visit Alice nokill` to visit without killing intent

#### 3. Day Discussion
```
☀️ Day 1: Discussion

💀 Last night: Charlie died.
(or)
✅ Last night: No one died.

Your Facts:
• Night 1: I was at Alice's location. Also present: Bob.

Alleged Info:
• Alice: "I stayed home last night."
• Bob: "I visited Charlie's house but he wasn't there."

Your turn to speak:
Share whatever you wish (facts, suspicions, lies, etc.)

Type your statement:
```

**Example responses:**
- As Innocent: "I was at Alice's house with Bob. We can confirm we were together."
- As Murderer (lying): "I stayed home alone all night, didn't see anyone."

#### 4. Voting Phase
```
🗳️ Day 1: Voting

Your Facts:
• [Your accumulated facts]

Alleged Info:
• [All statements from players]

Vote to hang a player or abstain:
Available: Alice, Bob, Charlie

Format:
• "vote Alice"
• "abstain"

Type your vote:
```

**Example responses:**
- Type: `vote Alice` to vote to hang Alice
- Type: `abstain` to skip voting

### Understanding Information Types

#### Facts (100% True)
These are things **you witnessed directly:**
- Who was at the same location as you during the night
- Role reveals when someone is hanged

Example: `Night 1: I was at Alice's location. Also present: Bob.`

#### Alleged Info (May Be Lies)
These are things **other players told you:**
- Introductions
- Day statements
- Can be complete lies if they're the murderer!

Example: `Alice: "I stayed home last night."` (You don't know if this is true)

### Winning Conditions

#### As Innocent
- **Win:** Hang the murderer during voting
- **Lose:** All innocents die, or 1v1 with murderer

#### As Murderer
- **Win:** Eliminate all innocents OR reach 1v1 situation
- **Lose:** Get hanged during voting

### Game Rules Reminder

**Night Actions:**
- Everyone chooses: stay home OR visit another player
- Murderer can have "intent to kill" or not
- If 3+ people at same location: kill is BLOCKED
- If 2 people and murderer has intent: victim DIES
- Murderer must attempt kill at least every other night

**Voting:**
- Need 50% + 1 of non-abstaining votes (minimum 2)
- Ties result in no hanging
- Hanged player's role is revealed

**Death Reveals:**
- Night deaths: Name only (role hidden)
- Hangings: Name + Role (to provide feedback)

## Example Gameplay Session

```
You: start game