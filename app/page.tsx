'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import MultiAgentView from '@/components/MultiAgentView';
import MurderMysteryView from '@/components/MurderMysteryView';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ReplierInput {
  frameSet?: any;
  contextCount?: number;
  agent?: string;
  reasons?: string;
}

export default function Home() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [debugOpen, setDebugOpen] = useState(false);
  const [replierInput, setReplierInput] = useState<ReplierInput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [mode, setMode] = useState<'example' | 'strategic-sharing' | 'murder-mystery'>('example');

  async function send() {
    const content = input.trim();
    if (!content) return;

    setMessages([...messages, { role: 'user', content }]);
    setInput('');
    setIsLoading(true);
    setErrorMsg('');

    try {
      // Use example orchestrator API
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...messages, { role: 'user', content }] })
      });

      const data = await res.json();

      if (!res.ok || data?.error) {
        setErrorMsg(data?.error || 'Request failed');
        setIsLoading(false);
        return;
      }

      if (data.assistantMessage) {
        setMessages([...messages, { role: 'user', content }, { role: 'assistant', content: data.assistantMessage }]);
        setReplierInput(data.replierInput || null);
      }
    } catch (error) {
      setErrorMsg('Network error occurred');
    }

    setIsLoading(false);
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      send();
    }
  };

  // If strategic sharing mode, show multi-agent view
  if (mode === 'strategic-sharing') {
    return <MultiAgentView onBackToExample={() => setMode('example')} />;
  }

  // If murder mystery mode, show murder mystery view
  if (mode === 'murder-mystery') {
    return <MurderMysteryView onBackToExample={() => setMode('example')} />;
  }

  // Render example mode
  const isExample = true; // At this point we know mode === 'example'

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <h1 className="text-4xl font-semibold text-[#e5ebff] tracking-wide mb-1">
        A3: Multi-agent Interaction
      </h1>
      <div className="text-[#a5b4fc] text-[0.95rem] mb-3">Conversational demo</div>

      <div className="flex gap-4 items-center justify-between my-3">
        <div className="flex gap-2">
          <Button
            variant={isExample ? 'default' : 'outline'}
            onClick={() => setMode('example')}
            className={isExample ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-white text-slate-900 border-slate-200 hover:bg-slate-50'}
          >
            Example
          </Button>
          <Button
            variant="outline"
            onClick={() => setMode('strategic-sharing')}
            className="bg-white text-slate-900 border-slate-200 hover:bg-slate-50"
          >
            Strategic Sharing
          </Button>
          <Button
            variant="outline"
            onClick={() => setMode('murder-mystery')}
            className="bg-white text-slate-900 border-slate-200 hover:bg-slate-50"
          >
            Murder Mystery
          </Button>
        </div>
        <Button
          variant="outline"
          onClick={() => setDebugOpen(!debugOpen)}
          className="bg-white text-slate-900 border-slate-200 hover:bg-slate-50"
        >
          {debugOpen ? 'Hide' : 'Show'} Debug
        </Button>
      </div>

      {errorMsg && (
        <div className="bg-red-50 text-red-900 border border-red-200 px-3 py-2.5 rounded-lg mb-3">
          {errorMsg}
        </div>
      )}

      <Card className="rounded-xl p-4 min-h-[320px] max-h-[800px] overflow-y-auto bg-white border border-slate-200 shadow-lg">
        <div className="flex flex-col gap-1.5">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`px-3.5 py-2.5 rounded-xl my-1 max-w-[80%] whitespace-pre-wrap leading-relaxed ${
                m.role === 'user'
                  ? 'bg-[#e8f0ff] text-[#0b1a3a] self-end border border-[#c7d2fe]'
                  : 'bg-[#f5f7fb] text-slate-900 self-start border border-slate-200'
              }`}
            >
              <div className="text-slate-500 text-xs mb-0.5">{m.role}</div>
              <div>{m.content}</div>
            </div>
          ))}
          {isLoading && (
            <div className="px-3.5 py-2.5 rounded-xl my-1 max-w-[80%] bg-[#f5f7fb] text-slate-900 self-start border border-slate-200">
              <div className="text-slate-500 text-xs mb-0.5">assistant</div>
              <div className="inline-flex gap-1.5 items-center">
                <span className="w-[7px] h-[7px] bg-slate-400 rounded-full animate-[blink_1.4s_infinite_both]"></span>
                <span className="w-[7px] h-[7px] bg-slate-400 rounded-full animate-[blink_1.4s_0.2s_infinite_both]"></span>
                <span className="w-[7px] h-[7px] bg-slate-400 rounded-full animate-[blink_1.4s_0.4s_infinite_both]"></span>
              </div>
            </div>
          )}
        </div>
      </Card>

      <div className="flex gap-2 items-center mt-3">
        <Input
          type="text"
          placeholder="Type a message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 px-2.5 py-2 rounded-lg border border-slate-200 bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
        />
        <Button
          onClick={send}
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium"
        >
          Send
        </Button>
      </div>

      {debugOpen && (
        <Card className="bg-white border border-dashed border-slate-200 p-3 mt-3 rounded-lg shadow font-mono text-sm">
          <div>
            <strong>Messages:</strong> {messages.length}
          </div>
          {replierInput && (
            <div className="mt-2">
              <div>
                <strong>Context Count:</strong> {replierInput.contextCount}
              </div>
              <div>
                <strong>Agent:</strong> {replierInput.agent || 'n/a'}
              </div>
              <div>
                <strong>Reason:</strong> {replierInput.reasons || 'n/a'}
              </div>
              <div className="grid grid-cols-2 gap-2 mt-1.5">
                {replierInput.frameSet?.frames &&
                  Object.entries(replierInput.frameSet.frames).map(([name, p]: [string, any]) => (
                    <div key={name}>
                      <strong>{name}</strong>: {p?.value}
                    </div>
                  ))}
              </div>
            </div>
          )}
        </Card>
      )}

      <style jsx>{`
        @keyframes blink {
          0%, 80%, 100% { opacity: 0.2; }
          40% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
