// Orchestrator: single-prompt agent selection → agent respond

import { geminiGenerate } from '../gemini';
import { JoyAgent } from '../agents/ExampleJoyAgent';
import { SadAgent } from '../agents/ExampleSadAgent';

const SELECTION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    agent: { type: 'STRING' },
    reasons: { type: 'STRING' }
  },
  required: ['agent']
};

export class Orchestrator {
  name: string;
  agentByName: {
    joy: JoyAgent;
    sad: SadAgent;
  };

  constructor() {
    this.name = 'joy_sad';
    this.agentByName = {
      joy: new JoyAgent(),
      sad: new SadAgent()
    };
  }

  async _respondWith(agentName: string, contents: any[]) {
    const agent = this.agentByName[agentName as keyof typeof this.agentByName] || this.agentByName.joy;
    const res = await agent.respond(contents);
    return res?.text || '';
  }

  async orchestrate(contents: any[]) {
    const orchestratorPrompt = `Your job is to choose which emotional agents should respond to the user right now.
        Think in two steps:
        1) What emotions would best connect with the user right now, and what do they need (e.g., reassurance, validation, encouragement, caution)? Prioritize the latest user message while considering prior user messages with light recency weighting.
        2) Pick the agent whose voice best matches that need.

        Available agents: "joy", "sad". ONLY USE ONE OF THESE AGENTS.

        Constraints:
        - Speak only through structured output. No extra text.
        - Choose agents only from the list above.
        - Prefer clarity and coherence over breadth.

        Output strictly as JSON:
        {
          "agent": "joy",
          "reasons": "User celebrated good news; needs warm encouragement"
        }`;

    const result = await geminiGenerate({
      contents,
      systemPrompt: orchestratorPrompt,
      config: { responseMimeType: 'application/json', responseSchema: SELECTION_SCHEMA }
    });

    let agent = 'joy';
    let reasons = 'Defaulted to joy';

    try {
      const parsed = JSON.parse(result.text || '{}');
      agent = parsed?.agent;
      if (parsed?.reasons) reasons = String(parsed.reasons);
    } catch (_) {}

    const text = await this._respondWith(agent, contents);

    const frameSet = { frames: { persona: { value: agent, rationale: [reasons] } } };
    return { assistantMessage: text || '', frameSet, agent, reasons };
  }
}
