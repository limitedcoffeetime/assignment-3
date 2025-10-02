import { geminiGenerate } from '../gemini.js';
import { JoyAgent } from '../agents/ExampleJoyAgent.js';
import { SadAgent } from '../agents/ExampleSadAgent.js';
import { AngryAgent } from '../agents/ExampleAngryAgent.js';

/**
 * Orchestrator that can synthesize a response by interleaving segments
 * from multiple emotion agents. It returns a tagged composite string like:
 * (sad)[It can surge with intensity.] (anger)[I WILL NOT LET THIS SLIDE.] (joy)[But there's still light.] 
 * and a structured segments array for the UI.
 */
export class Orchestrator {
  constructor() {
    this.name = 'joy_sad_anger_synthesis';
    this.agentByName = {
      joy: new JoyAgent(),
      sad: new SadAgent(),
      anger: new AngryAgent()
    };
  }

  async _respondWith(agentName, contents) {
    const agent = this.agentByName[agentName];
    if (!agent) return '';
    const res = await agent.respond(contents);
    return res?.text || '';
  }

  /**
   * Ask the LLM to design a segment plan: a list of {emotion, sentence} pairs.
   */
  async _planSegments(contents) {
    const PLAN_SCHEMA = {
      type: 'OBJECT',
      properties: {
        segments: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              emotion: { type: 'STRING' },
              cue: { type: 'STRING' }
            },
            required: ['emotion', 'cue']
          }
        },
        reasons: { type: 'STRING' }
      },
      required: ['segments']
    };

    const systemPrompt = `You plan a multi-emotion reply that interleaves voices.
        Return JSON with a 'segments' array of 2-5 items.
        Each item has: emotion in {joy, sad, anger} and a short 'cue' that hints what that sentence should convey.
        Keep the sequence coherent and supportive. Provide 'reasons' briefly.`;

    const { text } = await geminiGenerate({
      contents,
      systemPrompt,
      config: { responseMimeType: 'application/json', responseSchema: PLAN_SCHEMA }
    });

    try {
      const parsed = JSON.parse(text || '{}');
      const segments = Array.isArray(parsed?.segments) ? parsed.segments : [];
      const reasons = typeof parsed?.reasons === 'string' ? parsed.reasons : '';
      const sanitized = segments
        .map((s) => ({ emotion: String(s.emotion || '').toLowerCase(), cue: String(s.cue || '').trim() }))
        .filter((s) => ['joy', 'sad', 'anger'].includes(s.emotion) && s.cue);
      return { segments: sanitized.slice(0, 5), reasons };
    } catch (_) {
      return { segments: [{ emotion: 'sad', cue: 'Validate feelings and offer a gentle step.' }], reasons: 'Defaulted' };
    }
  }

  /**
   * Build each sentence by prompting the specific agent with the cue and history.
   */
  async _synthesize(contents, plan) {
    const sentences = [];
    for (const seg of plan) {
      const agentName = seg.emotion;
      const extendedContents = [
        ...contents,
        { role: 'user', parts: [{ text: `Instruction: Write ONE sentence for a composite reply. Focus: ${seg.cue}` }] }
      ];
      const sentence = (await this._respondWith(agentName, extendedContents)) || '';
      sentences.push({ emotion: agentName, text: sentence.trim() });
    }
    return sentences;
  }

  _toTaggedText(sentences) {
    return sentences
      .map((s) => `(${s.emotion})[${s.text}]`)
      .join(' ');
  }

  async orchestrate(contents) {
    const { segments, reasons } = await this._planSegments(contents);
    const built = await this._synthesize(contents, segments);
    const assistantMessage = this._toTaggedText(built);

    const frameSet = {
      frames: {
        persona: { value: 'multi', rationale: [reasons || 'multi-emotion synthesis'] }
      }
    };

    return { assistantMessage, frameSet, agent: 'multi', reasons, segments: built };
  }
}


