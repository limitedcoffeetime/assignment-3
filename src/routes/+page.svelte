<script>
  import { onMount } from 'svelte';
  
  let input = '';
  let messages = [];
  let debugOpen = false;
  let replierInput = null; // { frameSet, contextCount, agent, reasons }
  let isLoading = false;
  let errorMsg = '';
  
  const EMOJI = { joy: '🌟', sad: '💙', anger: '🔥' };
  const EMOTION_ORDER = ['sad', 'anger', 'joy'];

  function parseTaggedSegments(str) {
    const out = [];
    if (typeof str !== 'string' || !str) return out;
    const re = /\((joy|sad|anger)\)\[(.*?)\]/g; // (emotion)[text]
    let m;
    while ((m = re.exec(str)) !== null) {
      const emotion = (m[1] || '').toLowerCase();
      const text = (m[2] || '').trim();
      if (EMOTION_ORDER.includes(emotion) && text) out.push({ emotion, text });
    }
    return out;
  }

  function getSegments(message) {
    if (Array.isArray(message?.segments) && message.segments.length) return message.segments;
    return parseTaggedSegments(message?.content || '');
  }

  onMount(() => {});

  async function send() {
    const content = input.trim();
    if (!content) return;
    messages = [...messages, { role: 'user', content }];
    input = '';
    isLoading = true;
    errorMsg = '';
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ history: messages })
    });
    const data = await res.json();
    if (!res.ok || data?.error) {
      errorMsg = data?.error || 'Request failed';
      isLoading = false;
      return;
    }
    if (data.assistantMessage) {
      messages = [...messages, { role: 'assistant', content: data.assistantMessage, segments: data.segments || [] }];
      replierInput = data.replierInput || null;
    }
    isLoading = false;
  }
</script>

<style>
  :global(:root) {
    --bg: #0f172a;
    --bg-grad-a: #0b1223;
    --bg-grad-b: #111827;
    --card: #ffffff;
    --card-muted: #f8fafc;
    --border: #e5e7eb;
    --text: #0f172a;
    --muted: #64748b;
    --primary: #2563eb;
    --primary-600: #1d4ed8;
  }

  :global(html, body) {
    height: 100%;
    margin: 0;
    background: radial-gradient(1200px 600px at 20% -10%, rgba(37,99,235,0.25), transparent),
                radial-gradient(900px 500px at 100% 0%, rgba(34,197,94,0.18), transparent),
                linear-gradient(180deg, var(--bg-grad-a), var(--bg-grad-b));
    color: var(--text);
    font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, 'Apple Color Emoji', 'Segoe UI Emoji';
  }

  :global(*), :global(*::before), :global(*::after) { box-sizing: border-box; }

  .container { max-width: 960px; margin: 2.5rem auto; padding: 0 1rem; }
  h1 { color: #e5ebff; letter-spacing: 0.2px; margin: 0 0 0.25rem 0; font-weight: 650; }
  .subtle { color: #a5b4fc; font-size: 0.95rem; margin-bottom: 0.75rem; }

  .row { display: flex; gap: 0.5rem; align-items: center; }
  .chat {
    border-radius: 12px;
    padding: 1rem;
    min-height: 320px;
    max-height: 800px; /* enable scroll beyond 800px */
    overflow-y: auto;
    background: var(--card);
    border: 1px solid var(--border);
    box-shadow: 0 8px 24px rgba(2,6,23,0.12);
    -webkit-overflow-scrolling: touch;
  }
  .flexcol { display: flex; flex-direction: column; gap: 0.35rem; }
  .bubble { padding: 0.65rem 0.85rem; border-radius: 12px; margin: 0.25rem 0; max-width: 80%; white-space: pre-wrap; line-height: 1.4; }
  .user { background: #e8f0ff; color: #0b1a3a; align-self: flex-end; border: 1px solid #c7d2fe; }
  .assistant { background: #f5f7fb; color: #0f172a; align-self: flex-start; border: 1px solid #e5e7eb; }
  .bubble:hover { outline: 2px solid transparent; box-shadow: 0 1px 0 rgba(2,6,23,0.04); }
  .meta { color: var(--muted); font-size: 0.8rem; margin-bottom: 0.15rem; }

  /* Emotion segment visuals */
  :global(:root) {
    --joy: #f59e0b; /* amber-500 */
    --sad: #3b82f6; /* blue-500 */
    --anger: #ef4444; /* red-500 */
  }
  .seg { display: inline; padding-bottom: 1px; margin-right: 0.25rem; }
  .seg-tag { font-size: 0.85em; opacity: 0.8; margin-right: 0.2rem; }
  .seg-joy { text-decoration: underline; text-decoration-color: var(--joy); border-bottom: 2px solid var(--joy); }
  .seg-sad { text-decoration: underline; text-decoration-color: var(--sad); border-bottom: 2px solid var(--sad); }
  .seg-anger { text-decoration: underline; text-decoration-color: var(--anger); border-bottom: 2px solid var(--anger); }

  .icons { display: flex; gap: 6px; margin-top: 6px; align-items: center; }
  .icon { width: 20px; height: 20px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; }
  .icon-joy { background: rgba(245,158,11,0.15); border: 1px solid rgba(245,158,11,0.45); }
  .icon-sad { background: rgba(59,130,246,0.15); border: 1px solid rgba(59,130,246,0.45); }
  .icon-anger { background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.45); }

  .toolbar { display: flex; gap: 1rem; align-items: center; justify-content: space-between; margin: 0.75rem 0; }

  input[type="text"] {
    padding: 0.6rem 0.7rem; border-radius: 10px; border: 1px solid var(--border); background: var(--card);
    outline: none; transition: border-color .15s ease, box-shadow .15s ease;
  }
  input[type="text"]:focus { border-color: var(--primary); box-shadow: 0 0 0 3px rgba(37,99,235,0.15); }

  :global(button) { padding: 0.55rem 0.9rem; border: 1px solid transparent; border-radius: 10px; background: var(--primary); color: white; cursor: pointer; font-weight: 550; }
  :global(button:hover) { background: var(--primary-600); }
  :global(button.secondary) { background: var(--card); color: var(--text); border-color: var(--border); }
  :global(button.secondary:hover) { background: var(--card-muted); }

  .debug { background: var(--card); border: 1px dashed var(--border); padding: 0.75rem; margin-top: 0.75rem; border-radius: 10px; box-shadow: 0 2px 14px rgba(2,6,23,0.06);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; font-size: 0.85rem; }

  .error {
    background: #fff1f2;
    color: #7f1d1d;
    border: 1px solid #fecaca;
    padding: 0.6rem 0.75rem;
    border-radius: 10px;
    margin: 0.5rem 0 0.75rem 0;
  }

  .typing { display: inline-flex; gap: 6px; align-items: center; }
  .dot { width: 7px; height: 7px; background: #a3aab8; border-radius: 50%; animation: blink 1.4s infinite both; }
  .dot:nth-child(2) { animation-delay: .2s; }
  .dot:nth-child(3) { animation-delay: .4s; }
  @keyframes blink { 0%, 80%, 100% { opacity: 0.2; } 40% { opacity: 1; } }

  @media (max-width: 640px) {
    .bubble { max-width: 92%; }
    .toolbar { gap: 0.5rem; }
    .container { margin: 1.25rem auto; }
  }
</style>

<div class="container">
  <h1>A3: Multi-agent Interaction </h1>
  <div class="subtle">Conversational demo</div>
  <div class="toolbar" style="margin: 0.5rem 0 0.75rem 0;">
    <button class="secondary" on:click={() => (debugOpen = !debugOpen)}>{debugOpen ? 'Hide' : 'Show'} Debug</button>
  </div>

  {#if errorMsg}
    <div class="error" role="alert">
      {errorMsg}
    </div>
  {/if}

  <div class="chat flexcol">
    {#each messages as m, i}
      <div class="bubble {m.role}">
        <div class="meta">{m.role}</div>
        {#if m.role === 'assistant'}
          {#if getSegments(m).length > 0}
            <div>
              {#each getSegments(m) as s}
                <span class="seg seg-{s.emotion}"><span class="seg-tag">({s.emotion})</span>{s.text}</span>
              {/each}
            </div>
            <div class="icons" aria-label="Emotions in this reply">
              {#each getSegments(m) as s}
                <span class="icon icon-{s.emotion}" title={s.emotion}>{EMOJI[s.emotion]}</span>
              {/each}
            </div>
          {:else}
            <div>{m.content}</div>
          {/if}
        {:else}
          <div>{m.content}</div>
        {/if}
      </div>
    {/each}
    {#if isLoading}
      <div class="bubble assistant">
        <div class="meta">assistant</div>
        <div class="typing" aria-label="Assistant is typing">
          <span class="dot"></span>
          <span class="dot"></span>
          <span class="dot"></span>
        </div>
      </div>
    {/if}
  </div>

  <div class="row" style="margin-top: 0.75rem;">
    <input type="text"
      placeholder="Type a message..."
      bind:value={input}
      on:keydown={(e) => e.key === 'Enter' && send()}
      style="flex: 1; padding: 0.6rem; border-radius: 6px; border: 1px solid #ddd;"
    />
    <button on:click={send}>Send</button>
  </div>

</div>

{#if debugOpen}
  <div class="debug">
    <div><strong>Messages:</strong> {messages.length}</div>
    {#if replierInput}
      <div style="margin-top: 0.5rem;">
        <div><strong>Context Count:</strong> {replierInput.contextCount}</div>
        <div><strong>Agent:</strong> {replierInput.agent || 'n/a'}</div>
        <div><strong>Reason:</strong> {replierInput.reasons || 'n/a'}</div>
        <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.5rem; margin-top: 0.35rem;">
          {#each Object.entries(replierInput.frameSet?.frames || {}) as [name, p]}
            <div><strong>{name}</strong>: {p?.value}</div>
          {/each}
        </div>
      </div>
    {/if}
  </div>
{/if}
