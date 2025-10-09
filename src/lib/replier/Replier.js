import { parseStepMention } from '../utils/text.js';
import { hasGemini, geminiGenerate } from '../pipeline/gemini.js';

export class Replier {
  constructor() {}

  /**
   * Build a reply that follows the ActivatedFrameSet and recent context.
   * Requires a valid Gemini API key; errors if unavailable or the call fails.
   */
  async reply({ userMessage, context, frameSet }) {
    const frames = frameSet.frames || {};
    const key = frames.key?.value || 'neutral';
    const genre = frames.genre?.value || 'chat';
    const ends = frames.ends?.value || 'chat';
    const role = frames.participants?.value || 'peer_helper';
    const bridge = frameSet.meta?.transitions || [];

    // Enforce presence of a Gemini key (env or override). If missing, throw so the API can surface it.
    if (!hasGemini(context?.geminiKey)) {
      throw new Error('GEMINI_API_KEY not found');
    }

    const systemPrompt = this._buildSystemPrompt({ key, genre, ends, role, bridge });
    const userText = this._buildUserContent(userMessage);
    const { text } = await geminiGenerate({ userText, systemPrompt, apiKey: context?.geminiKey });
    return text || '';
  }

  _buildSystemPrompt({ key, genre, ends, role, bridge }) {
    const lines = [];
    lines.push('You are an assistant that must follow the given conversation frames.');
    lines.push('Follow role, tone, genre, and goal constraints.');
    lines.push('Be concise and actionable.');
    lines.push('Frames:');
    lines.push(`- Key (tone): ${key}`);
    lines.push(`- Genre: ${genre}`);
    lines.push(`- Ends (goal): ${ends}`);
    lines.push(`- Participants (role): ${role}`);
    if (bridge?.length) lines.push(`- Transitions: ${bridge.join(' ')}`);
    lines.push('Output only the assistant reply text.');
    return lines.join('\n');
  }

  _buildUserContent(userMessage) {
    const lines = [];
    lines.push('User message:');
    lines.push(userMessage || '');
    const stepNum = parseStepMention(userMessage || '');
    if (stepNum) lines.push(`Note: user mentioned step ${stepNum}.`);
    return lines.join('\n');
  }

  // No local fallback; all replies come from Gemini.
}
