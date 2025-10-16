'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface ConversationMessage {
  from: string;
  to: string;
  message: string;
  timestamp: number;
  isPrivate?: boolean; // Private messages (like role assignment)
}

interface DebugEvent {
  type: string;
  data: any;
  timestamp: number;
}

type Phase = 'init' | string; // night_1, day_1_discussion, day_1_voting, etc.

export default function MurderMysteryView({ onBackToExample }: { onBackToExample?: () => void }) {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [currentPhase, setCurrentPhase] = useState<Phase>('init');
  const [waitingForFinn, setWaitingForFinn] = useState(false);
  const [finnInput, setFinnInput] = useState('');
  const [myRole, setMyRole] = useState<string | null>(null);

  // Separate conversation histories for each column
  const [finnConvo, setFinnConvo] = useState<ConversationMessage[]>([]);
  const [aliceConvo, setAliceConvo] = useState<ConversationMessage[]>([]);
  const [bobConvo, setBobConvo] = useState<ConversationMessage[]>([]);
  const [charlieConvo, setCharlieConvo] = useState<ConversationMessage[]>([]);
  const [debugEvents, setDebugEvents] = useState<DebugEvent[]>([]);

  const [gameOver, setGameOver] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);
  const [showAIBrains, setShowAIBrains] = useState(true);

  // Parse individual message
  const parseMessage = (msg: any) => {
    const timestamp = Date.now();
    const conversationMsg: ConversationMessage = {
      from: msg.from || 'Orchestrator',
      to: msg.to || msg.agent,
      message: msg.reasoning ? `${msg.message}\n\n💭 Reasoning: ${msg.reasoning}` : msg.message,
      timestamp,
      isPrivate: msg.isPrivate
    };

    // Helper: should this message appear in this agent's column?
    const shouldShowInColumn = (agentName: string) => {
      // If message is directly TO this agent, always show it
      if (msg.to === agentName) return true;

      // If msg.agent specifies this column AND message is not to 'Everyone', show it
      if (msg.agent === agentName && msg.to !== 'Everyone') return true;

      // For 'Everyone' messages: show in this agent's column ONLY if this agent is NOT the sender
      // (sender already sees their outbound message, don't duplicate it)
      if (msg.to === 'Everyone' && msg.agent === agentName && msg.from !== agentName) return true;

      return false;
    };

    // Route to appropriate column
    if (shouldShowInColumn('Finn')) {
      setFinnConvo(prev => [...prev, conversationMsg]);
    }
    if (shouldShowInColumn('Alice')) {
      setAliceConvo(prev => [...prev, conversationMsg]);
    }
    if (shouldShowInColumn('Bob')) {
      setBobConvo(prev => [...prev, conversationMsg]);
    }
    if (shouldShowInColumn('Charlie')) {
      setCharlieConvo(prev => [...prev, conversationMsg]);
    }
  };

  const addDebugEvent = (type: string, data: any) => {
    setDebugEvents(prev => [...prev, { type, data, timestamp: Date.now() }]);
  };

  async function startGame() {
    // Reset
    await fetch('/api/murder-mystery', { method: 'DELETE' });
    setFinnConvo([]);
    setAliceConvo([]);
    setBobConvo([]);
    setCharlieConvo([]);
    setDebugEvents([]);
    setErrorMsg('');
    setGameOver(false);
    setWinner(null);
    setMyRole(null);

    setIsLoading(true);

    try {
      // Initialize game
      const initRes = await fetch('/api/murder-mystery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'init',
          playerNames: ['Alice', 'Bob', 'Charlie', 'Finn'],
          humanPlayerName: 'Finn'
        })
      });

      const initData = await initRes.json();
      addDebugEvent('Game Initialized', initData);

      // Show role assignments to ALL players (each in their own column)
      initData.roleAssignments.forEach((r: any) => {
        if (r.agent === 'Finn') {
          setMyRole(r.role);
        }
        parseMessage({
          agent: r.agent,
          from: 'Game Master',
          to: r.agent,
          message: `🔒 Your secret role: ${r.role.toUpperCase()}`,
          isPrivate: true
        });
      });

      // Start Night 1 immediately
      setCurrentPhase('night_1');
      showPhasePrompt('night_1');
      setIsLoading(false);

    } catch (error) {
      console.error('Error starting game:', error);
      setErrorMsg('Failed to start game');
      setIsLoading(false);
    }
  }

  function showPhasePrompt(phase: Phase) {
    if (phase.startsWith('night_')) {
      // Show night action prompt
      parseMessage({
        agent: 'Finn',
        from: 'Game Master',
        to: 'Finn',
        message: myRole === 'murderer'
          ? 'NIGHT PHASE: Choose your action. You can either "stay at your home" or "visit another player\'s HOME" (Alice, Bob, Charlie). Also specify if you have "intent to kill" (yes/no). IMPORTANT: If you visit someone, you go to THEIR home - they might not be there if they visited elsewhere!'
          : 'NIGHT PHASE: Choose your action. You can either "stay at your home" or "visit another player\'s HOME" (Alice, Bob, Charlie). IMPORTANT: If you visit someone, you go to THEIR home - they might not be there if they visited elsewhere!'
      });

      setWaitingForFinn(true);

    } else if (phase.includes('_discussion')) {
      // Show discussion prompt
      parseMessage({
        agent: 'Finn',
        from: 'Game Master',
        to: 'Finn',
        message: 'DAY DISCUSSION: Make a public statement. Share what you saw, make accusations, or say anything.'
      });

      setWaitingForFinn(true);

    } else if (phase.includes('_voting')) {
      // Show voting prompt
      parseMessage({
        agent: 'Finn',
        from: 'Game Master',
        to: 'Finn',
        message: 'VOTING PHASE: Vote to hang someone or abstain. Say a player name or "abstain".'
      });

      setWaitingForFinn(true);
    }
  }

  async function processPhase(phase: Phase, finnResponse: string) {
    setIsLoading(true);
    setWaitingForFinn(false);

    try {
      const res = await fetch('/api/murder-mystery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phase,
          humanResponses: { Finn: finnResponse }
        })
      });

      if (!res.ok) {
        setErrorMsg('Request failed');
        setIsLoading(false);
        return;
      }

      const data = await res.json();
      addDebugEvent(`${phase} Complete`, data);

      // Handle Night phase
      if (phase.startsWith('night_')) {
        // Show night actions in debug only (not visible to players)
        addDebugEvent('Night Actions', data.nightActions);

        // Show night prompts to each agent (skip Finn - they already saw it)
        data.nightPrompts?.forEach((p: any) => {
          if (p.agent === 'Finn') return; // Skip human player
          parseMessage({
            agent: p.agent,
            from: 'Game Master',
            to: p.agent,
            message: `📋 ${p.prompt}`,
            isPrivate: true
          });
        });

        // Show night responses with reasoning (only visible to each agent, skip Finn)
        data.nightResponses?.forEach((r: any) => {
          if (r.agent === 'Finn') return; // Skip human player - already shown
          parseMessage({
            agent: r.agent,
            from: r.agent,
            to: 'Game Master',
            message: `${r.response}${r.reasoning ? `\n\n💭 Reasoning: ${r.reasoning}` : ''}`,
            isPrivate: true
          });
        });

        // Show observations privately to each agent
        data.observations.forEach((obs: any) => {
          parseMessage({
            agent: obs.agent,
            from: 'Game Master',
            to: obs.agent,
            message: `🌙 ${obs.observation}`,
            isPrivate: true
          });
        });

        // Announce deaths publicly
        if (data.deaths.length > 0) {
          ['Finn', 'Alice', 'Bob', 'Charlie'].forEach(agent => {
            parseMessage({
              agent,
              from: 'Game Master',
              to: 'Everyone',
              message: `💀 ${data.deaths.join(', ')} died last night.`
            });
          });
        } else {
          ['Finn', 'Alice', 'Bob', 'Charlie'].forEach(agent => {
            parseMessage({
              agent,
              from: 'Game Master',
              to: 'Everyone',
              message: `No one died last night.`
            });
          });
        }

        // Check win condition
        if (data.winner) {
          setGameOver(true);
          setWinner(data.winner);

          // Special message if human player died
          if (data.humanPlayerDied) {
            parseMessage({
              agent: 'Finn',
              from: 'Game Master',
              to: 'Finn',
              message: `💀 GAME OVER - You died!\n\n${data.winReason}\n\nThe game will continue among the AI agents, but your story ends here.`,
              isPrivate: true
            });
          } else {
            ['Finn', 'Alice', 'Bob', 'Charlie'].forEach(agent => {
              parseMessage({
                agent,
                from: 'Game Master',
                to: 'Everyone',
                message: `🎮 GAME OVER! ${data.winner.toUpperCase()} WIN!\n\nReason: ${data.winReason}`
              });
            });
          }
        } else {
          // Move to next phase
          setTimeout(() => {
            setCurrentPhase(data.nextPhase);
            showPhasePrompt(data.nextPhase);
          }, 1000);
        }
      }

      // Handle Day Discussion
      else if (phase.includes('_discussion')) {
        // Show discussion prompts to each agent (skip Finn - they already saw it)
        data.discussionPrompts?.forEach((p: any) => {
          if (p.agent === 'Finn') return; // Skip human player
          parseMessage({
            agent: p.agent,
            from: 'Game Master',
            to: p.agent,
            message: `📋 ${p.prompt}`,
            isPrivate: true
          });
        });

        // Show each agent's statement WITH reasoning in their own column
        data.statements.forEach((s: any) => {
          // For non-Finn agents: Show full statement + reasoning to the agent who made it
          if (s.agent !== 'Finn') {
            parseMessage({
              agent: s.agent,
              from: s.agent,
              to: 'Everyone',
              message: `${s.statement}${s.reasoning ? `\n\n💭 Reasoning: ${s.reasoning}` : ''}`
            });
          }

          // Show just the statement (no reasoning) to other agents
          ['Finn', 'Alice', 'Bob', 'Charlie'].forEach(agent => {
            if (agent === s.agent) return; // Skip sender
            parseMessage({
              agent,
              from: s.agent,
              to: 'Everyone',
              message: s.statement
            });
          });
        });

        // Move to voting
        setTimeout(() => {
          setCurrentPhase(data.nextPhase);
          showPhasePrompt(data.nextPhase);
        }, 1000);
      }

      // Handle Day Voting
      else if (phase.includes('_voting')) {
        // Show vote prompts to each agent (skip Finn - they already saw it)
        data.votePrompts?.forEach((p: any) => {
          if (p.agent === 'Finn') return; // Skip human player
          parseMessage({
            agent: p.agent,
            from: 'Game Master',
            to: p.agent,
            message: `📋 ${p.prompt}`,
            isPrivate: true
          });
        });

        // Show each agent's vote WITH reasoning in their own column (skip Finn - already shown)
        data.votes.forEach((v: any) => {
          if (v.agent === 'Finn') return; // Skip human player - already shown
          parseMessage({
            agent: v.agent,
            from: v.agent,
            to: 'Game Master',
            message: `Vote: ${v.vote}${v.reasoning ? `\n\n💭 Reasoning: ${v.reasoning}` : ''}`,
            isPrivate: true
          });
        });

        // Show vote summary publicly
        ['Finn', 'Alice', 'Bob', 'Charlie'].forEach(agent => {
          const voteList = data.votes.map((v: any) => `${v.agent} → ${v.vote}`).join(', ');
          parseMessage({
            agent,
            from: 'Game Master',
            to: 'Everyone',
            message: `🗳️ Votes: ${voteList}`
          });
        });

        // Show result
        if (data.hanged) {
          ['Finn', 'Alice', 'Bob', 'Charlie'].forEach(agent => {
            parseMessage({
              agent,
              from: 'Game Master',
              to: 'Everyone',
              message: `⚖️ ${data.hanged} was hanged! They were: ${data.hangedRole.toUpperCase()}`
            });
          });
        } else {
          ['Finn', 'Alice', 'Bob', 'Charlie'].forEach(agent => {
            parseMessage({
              agent,
              from: 'Game Master',
              to: 'Everyone',
              message: `⚖️ No one was hanged (tie or insufficient votes)`
            });
          });
        }

        // Check win condition
        if (data.winner) {
          setGameOver(true);
          setWinner(data.winner);
          ['Finn', 'Alice', 'Bob', 'Charlie'].forEach(agent => {
            parseMessage({
              agent,
              from: 'Game Master',
              to: 'Everyone',
              message: `🎮 GAME OVER! ${data.winner.toUpperCase()} WIN!\n\nReason: ${data.winReason}`
            });
          });
        } else {
          // Move to next night
          setTimeout(() => {
            setCurrentPhase(data.nextPhase);
            showPhasePrompt(data.nextPhase);
          }, 1000);
        }
      }

      setIsLoading(false);

    } catch (error) {
      console.error('Error processing phase:', error);
      setErrorMsg('Failed to process phase');
      setIsLoading(false);
    }
  }

  const submitFinnResponse = async () => {
    if (!finnInput.trim() || currentPhase === 'init') return;

    const response = finnInput.trim();
    setFinnInput('');

    // Show Finn's response
    parseMessage({
      agent: 'Finn',
      from: 'Finn',
      to: currentPhase.includes('discussion') ? 'Everyone' : 'Game Master',
      message: response
    });

    // Process this phase
    await processPhase(currentPhase, response);
  };

  const ConversationColumn = ({ title, messages, bgColor, showInput, showRole }: {
    title: string;
    messages: ConversationMessage[];
    bgColor: string;
    showInput?: boolean;
    showRole?: boolean;
  }) => (
    <div className="flex-1 flex flex-col h-full">
      <div className={`${bgColor} text-white px-3 py-2 font-semibold text-sm rounded-t-lg`}>
        {title}
        {showRole && myRole && (
          <span className="ml-2 text-xs opacity-90">
            ({myRole === 'murderer' ? '🔪 MURDERER' : '😇 INNOCENT'})
          </span>
        )}
      </div>
      <Card className="flex-1 rounded-t-none rounded-b-lg p-3 overflow-y-auto bg-white border border-slate-200 min-h-0">
        <div className="flex flex-col gap-2">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`px-2.5 py-2 rounded-lg text-sm ${
                msg.isPrivate
                  ? 'bg-red-50 text-slate-900 border border-red-300'
                  : msg.from === 'Game Master'
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
          {showInput && waitingForFinn && !gameOver && (
            <div className="mt-2 flex gap-2">
              <Input
                type="text"
                placeholder="Your response..."
                value={finnInput}
                onChange={(e) => setFinnInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    submitFinnResponse();
                  }
                }}
                className="flex-1"
                autoFocus
              />
              <Button onClick={submitFinnResponse} size="sm">
                Send
              </Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );

  const DebugColumn = () => (
    <div className="flex-1 flex flex-col h-full">
      <div className="bg-slate-700 text-white px-3 py-2 font-semibold text-sm rounded-t-lg">
        🔍 Game Master Debug
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
            🔪 Murder Mystery Game
          </h1>
          <div className="text-slate-600 text-sm">
            Social deduction game with isolated agent contexts
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={startGame}
            disabled={isLoading}
            className="bg-red-600 hover:bg-red-700 text-white font-medium px-6"
          >
            {isLoading ? 'Processing...' : currentPhase === 'init' ? '▶ Start Game' : '🔄 New Game'}
          </Button>
          <Button
            onClick={() => setShowAIBrains(!showAIBrains)}
            variant="outline"
            className="bg-white text-slate-900 border-slate-200 hover:bg-slate-50"
          >
            {showAIBrains ? '👁️ Hide AI Brains' : '👁️ Show AI Brains'}
          </Button>
          {onBackToExample && (
            <Button
              onClick={onBackToExample}
              variant="outline"
              className="bg-white text-slate-900 border-slate-200 hover:bg-slate-50"
            >
              ← Back
            </Button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="bg-red-50 text-red-900 border border-red-200 px-3 py-2 rounded-lg mb-3">
          {errorMsg}
        </div>
      )}

      {currentPhase !== 'init' && (
        <div className="bg-blue-50 text-blue-900 border border-blue-200 px-3 py-2 rounded-lg mb-3 text-sm">
          📍 Current Phase: <span className="font-semibold">{currentPhase}</span>
          {gameOver && <span className="ml-4 text-green-700 font-bold">🎮 GAME OVER - {winner?.toUpperCase()} WIN!</span>}
        </div>
      )}

      {/* 5-column layout (or 1-column if AI brains hidden) */}
      <div className="flex-1 flex gap-3 min-h-0">
        <ConversationColumn
          title="👤 Finn (You)"
          messages={finnConvo}
          bgColor="bg-slate-600"
          showInput={true}
          showRole={true}
        />
        {showAIBrains && (
          <>
            <ConversationColumn
              title="🦊 Alice"
              messages={aliceConvo}
              bgColor="bg-orange-600"
            />
            <ConversationColumn
              title="🐻 Bob"
              messages={bobConvo}
              bgColor="bg-blue-600"
            />
            <ConversationColumn
              title="🦁 Charlie"
              messages={charlieConvo}
              bgColor="bg-yellow-600"
            />
            <DebugColumn />
          </>
        )}
      </div>
    </div>
  );
}
