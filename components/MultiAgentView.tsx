'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface ConversationMessage {
  from: string;
  to: string;
  message: string;
  timestamp: number;
}

interface DebugEvent {
  type: string;
  data: any;
  timestamp: number;
}

export default function MultiAgentView({ onBackToExample }: { onBackToExample?: () => void }) {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Separate conversation histories for each column
  const [humanConvo, setHumanConvo] = useState<ConversationMessage[]>([]);
  const [aliceConvo, setAliceConvo] = useState<ConversationMessage[]>([]);
  const [bobConvo, setBobConvo] = useState<ConversationMessage[]>([]);
  const [charlieConvo, setCharlieConvo] = useState<ConversationMessage[]>([]);
  const [debugEvents, setDebugEvents] = useState<DebugEvent[]>([]);

  // Parse API response and distribute to appropriate columns
  const parseResponse = (responseText: string, debugData?: any) => {
    const lines = responseText.split('\n');
    const timestamp = Date.now();

    lines.forEach(line => {
      // Parse messages like "**[Game Master → Alice]:** message"
      const gmToAgentMatch = line.match(/\*\*\[Game Master → (\w+)\]:\*\* (.+)/);
      if (gmToAgentMatch) {
        const [, agent, message] = gmToAgentMatch;
        const msg: ConversationMessage = {
          from: 'Game Master',
          to: agent,
          message: message.trim(),
          timestamp
        };

        if (agent === 'You') setHumanConvo(prev => [...prev, msg]);
        else if (agent === 'Alice') setAliceConvo(prev => [...prev, msg]);
        else if (agent === 'Bob') setBobConvo(prev => [...prev, msg]);
        else if (agent === 'Charlie') setCharlieConvo(prev => [...prev, msg]);
        return;
      }

      // Parse agent responses like "**Alice:** "message""
      const agentRespMatch = line.match(/\*\*(\w+):\*\* "(.+)"/);
      if (agentRespMatch) {
        const [, agent, message] = agentRespMatch;
        const msg: ConversationMessage = {
          from: agent,
          to: 'Game Master',
          message: message.trim(),
          timestamp
        };

        // Handle both human player and agents
        if (agent === 'Player' || agent === 'You') setHumanConvo(prev => [...prev, msg]);
        else if (agent === 'Alice') setAliceConvo(prev => [...prev, msg]);
        else if (agent === 'Bob') setBobConvo(prev => [...prev, msg]);
        else if (agent === 'Charlie') setCharlieConvo(prev => [...prev, msg]);
        return;
      }

      // General messages (system announcements, etc.) - show to human
      if (line.trim() && !line.startsWith('**[') && !line.startsWith('🎮')) {
        const msg: ConversationMessage = {
          from: 'Game Master',
          to: 'You',
          message: line.trim(),
          timestamp
        };
        setHumanConvo(prev => [...prev, msg]);
      }
    });

    // Add debug events if provided
    if (debugData?.debugEvents) {
      setDebugEvents(prev => [...prev, ...debugData.debugEvents]);
    }
  };

  async function send() {
    const content = input.trim();
    if (!content) return;

    setInput('');
    setIsLoading(true);
    setErrorMsg('');

    // Add user message to human conversation
    setHumanConvo(prev => [...prev, {
      from: 'You',
      to: 'Game Master',
      message: content,
      timestamp: Date.now()
    }]);

    try {
      const res = await fetch('/api/murder-game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content })
      });

      const data = await res.json();

      if (!res.ok || data?.error) {
        setErrorMsg(data?.error || 'Request failed');
        setIsLoading(false);
        return;
      }

      if (data.assistantMessage) {
        parseResponse(data.assistantMessage, data);
      }
    } catch (error) {
      setErrorMsg('Network error occurred');
    }

    setIsLoading(false);
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isLoading) {
      send();
    }
  };

  const ConversationColumn = ({ title, messages, bgColor }: {
    title: string;
    messages: ConversationMessage[];
    bgColor: string;
  }) => (
    <div className="flex-1 flex flex-col h-full">
      <div className={`${bgColor} text-white px-3 py-2 font-semibold text-sm rounded-t-lg`}>
        {title}
      </div>
      <Card className="flex-1 rounded-t-none rounded-b-lg p-3 overflow-y-auto bg-white border border-slate-200 min-h-0">
        <div className="flex flex-col gap-2">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`px-2.5 py-2 rounded-lg text-sm ${
                msg.from === 'Game Master'
                  ? 'bg-blue-50 text-slate-900 border border-blue-200'
                  : 'bg-slate-100 text-slate-900 border border-slate-300'
              }`}
            >
              <div className="text-xs text-slate-500 mb-1">
                {msg.from} → {msg.to}
              </div>
              <div className="whitespace-pre-wrap">{msg.message}</div>
            </div>
          ))}
          {isLoading && title === 'You' && (
            <div className="px-2.5 py-2 rounded-lg text-sm bg-blue-50 border border-blue-200">
              <div className="inline-flex gap-1.5 items-center">
                <span className="w-[6px] h-[6px] bg-slate-400 rounded-full animate-pulse"></span>
                <span className="w-[6px] h-[6px] bg-slate-400 rounded-full animate-pulse delay-100"></span>
                <span className="w-[6px] h-[6px] bg-slate-400 rounded-full animate-pulse delay-200"></span>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );

  const DebugColumn = () => (
    <div className="flex-1 flex flex-col h-full">
      <div className="bg-purple-600 text-white px-3 py-2 font-semibold text-sm rounded-t-lg">
        🔍 Orchestrator Debug
      </div>
      <Card className="flex-1 rounded-t-none rounded-b-lg p-3 overflow-y-auto bg-slate-900 border border-slate-700 min-h-0 font-mono text-xs">
        <div className="flex flex-col gap-2">
          {debugEvents.map((event, i) => (
            <div key={i} className="bg-slate-800 text-slate-100 px-2 py-1.5 rounded border border-slate-700">
              <div className="text-purple-400 font-semibold mb-1">
                {event.type}
              </div>
              <pre className="text-slate-300 text-[10px] whitespace-pre-wrap overflow-x-auto">
                {JSON.stringify(event.data, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );

  return (
    <div className="h-screen flex flex-col p-4 bg-slate-50">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900 mb-1">
            Multi-Agent Murder Mystery
          </h1>
          <div className="text-slate-600 text-sm">
            Five-column view: Human, Alice, Bob, Charlie, and Orchestrator Debug
          </div>
        </div>
        {onBackToExample && (
          <Button
            onClick={onBackToExample}
            variant="outline"
            className="bg-white text-slate-900 border-slate-200 hover:bg-slate-50"
          >
            ← Back to Example
          </Button>
        )}
      </div>

      {errorMsg && (
        <div className="bg-red-50 text-red-900 border border-red-200 px-3 py-2 rounded-lg mb-3">
          {errorMsg}
        </div>
      )}

      {/* 5-column layout */}
      <div className="flex-1 flex gap-3 min-h-0">
        <ConversationColumn
          title="👤 You (Human)"
          messages={humanConvo}
          bgColor="bg-blue-600"
        />
        <ConversationColumn
          title="🤖 Alice"
          messages={aliceConvo}
          bgColor="bg-green-600"
        />
        <ConversationColumn
          title="🤖 Bob"
          messages={bobConvo}
          bgColor="bg-amber-600"
        />
        <ConversationColumn
          title="🤖 Charlie"
          messages={charlieConvo}
          bgColor="bg-red-600"
        />
        <DebugColumn />
      </div>

      {/* Input at bottom */}
      <div className="flex gap-2 items-center mt-3">
        <Input
          type="text"
          placeholder="Type your message as the human player..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          className="flex-1 px-3 py-2 rounded-lg border border-slate-300 bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
        />
        <Button
          onClick={send}
          disabled={isLoading}
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-6"
        >
          {isLoading ? 'Sending...' : 'Send'}
        </Button>
      </div>
    </div>
  );
}
