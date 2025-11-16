/**
 * Doctor Role
 *
 * Goal: Protect town members from being killed
 * Night Action: Protect one player from death
 * Ability: If protected player would die, they survive instead
 */

import { Role, RoleContext, toHomeName } from './Role';
import { GameEvent, createMoveEvent, createProtectEvent } from '../game/events';

export const DoctorRole: Role = {
  roleName: 'doctor',
  alignment: 'town',

  getSystemPrompt(context: RoleContext): string {
    const { agentName, allPlayers } = context;

    return `You are ${agentName}, the DOCTOR. Your goal is to protect town members from being killed by the murderer. Each night you can protect one player (including yourself) from death. If the murderer tries to kill your protected player, they will survive.

GAME RULES YOU MUST KNOW:
- PLAYERS IN GAME: ${allPlayers.join(', ')}. Only these players exist - do not mention other names.
- PROTECTION: Each night you can protect ONE player from death. If that player would be killed, they survive instead.
- LOCATIONS: When you "protect" someone, you go to THEIR HOME to guard them. They might not be there if they visited elsewhere, but protection still works.
- KILLING: The murderer can only kill when EXACTLY 2 people are at a location (murderer + victim). If > 2 people are present, the murderer cannot kill anyway.
- The murderer can CHOOSE whether to kill each night. A night with no deaths does NOT mean there's no murderer.
- There is only ONE murderer. All other players (including you and other innocents) cannot knowingly lie.
- STRATEGY: You can choose to reveal your role publicly, or keep it secret. Revealing might make you a target.

REASONING STYLE: When providing reasoning, be CONCISE. Focus only on your key decision factors.`;
  },

  getNightPrompt(context: RoleContext): string {
    const { alivePlayers } = context;

    return `Who do you want to protect tonight? Choose one player (you can protect yourself): ${alivePlayers.join(', ')}`;
  },

  async interpretNightAction(
    rawInput: string,
    context: RoleContext,
    interpretFn: <T>(rawInput: string, prompt: string, schema: any) => Promise<T>
  ): Promise<GameEvent[]> {
    const { agentName, alivePlayers } = context;

    const interpretationPrompt = `The player is ${agentName}, the DOCTOR. They need to choose ONE player to protect from death (can include themselves). Available players: ${alivePlayers.join(', ')}.`;

    const schema = {
      type: 'OBJECT',
      properties: {
        target: {
          type: 'STRING',
          description: `Name of player to protect. Choose from: ${alivePlayers.join(', ')}.`,
          enum: alivePlayers
        }
      },
      required: ['target']
    };

    const result = await interpretFn<{ target: string }>(
      rawInput,
      interpretationPrompt,
      schema
    );

    const events: GameEvent[] = [];
    const target = result.target;

    // MOVE event - doctor goes to target's home to protect them
    const targetHome = toHomeName(target);
    events.push(createMoveEvent(agentName, targetHome));

    // PROTECT event - doctor protects the target
    events.push(createProtectEvent(agentName, target));

    return events;
  }
};
