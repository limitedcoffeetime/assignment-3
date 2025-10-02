import { json } from '@sveltejs/kit';
import { Orchestrator } from '$lib/orchestrators/ExampleJoySadAngryOrchestrator.js';

/**
 * Handle chat POST requests for a single-turn pipeline execution.
 *
 * Parameters: ({ request }) SvelteKit request wrapper.
 * Returns: JSON response with pipeline output or error.
 */
export async function POST({ request }) {
  const body = await request.json();
  const { history } = body || {};

  if (!Array.isArray(history)) {
    return json({ error: 'history array is required' }, { status: 400 });
  }

  try {
    const orchestrator = new Orchestrator();
    const contents = history.map((m) => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] }));
    
    const { assistantMessage, frameSet, agent, reasons, segments } = await orchestrator.orchestrate(contents);
    
    return json({ assistantMessage, segments, replierInput: { frameSet, contextCount: history.length, agent, reasons } });
  } catch (err) {
    const msg = String(err?.message || err || '').toLowerCase();
    if (msg.includes('gemini_api_key') || msg.includes('gemini') || msg.includes('api key')) {
      return json({ error: 'Gemini API key not found' }, { status: 400 });
    }
    return json({ error: 'Pipeline error', details: String(err?.message || err) }, { status: 500 });
  }
}
