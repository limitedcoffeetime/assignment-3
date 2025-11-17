'use client';

import { useState, useEffect, useRef } from 'react';
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

export default function MurderMysteryView({
  enabledRoles,
  initialShowAIBrains = true
}: {
  enabledRoles?: { detective: boolean; doctor: boolean };
  initialShowAIBrains?: boolean;
}) {
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
  const [showAIBrains, setShowAIBrains] = useState(initialShowAIBrains);
  const [darkMode, setDarkMode] = useState(false);

  // Refs for auto-scrolling to bottom - use refs for the scroll containers themselves
  const finnScrollRef = useRef<HTMLDivElement>(null);
  const aliceScrollRef = useRef<HTMLDivElement>(null);
  const bobScrollRef = useRef<HTMLDivElement>(null);
  const charlieScrollRef = useRef<HTMLDivElement>(null);
  const debugScrollRef = useRef<HTMLDivElement>(null);

  // Ref for the input to maintain focus
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-toggle dark mode based on phase
  useEffect(() => {
    if (currentPhase.startsWith('night_')) {
      setDarkMode(true);
    } else if (currentPhase.includes('day_') || currentPhase === 'init') {
      setDarkMode(false);
    }
  }, [currentPhase]);

  // Auto-scroll to bottom when messages update - use requestAnimationFrame to avoid focus issues
  useEffect(() => {
    const activeElement = document.activeElement;
    requestAnimationFrame(() => {
      if (finnScrollRef.current) {
        finnScrollRef.current.scrollTop = finnScrollRef.current.scrollHeight;
      }
      // Restore focus if it was on the input
      if (activeElement === inputRef.current && inputRef.current) {
        inputRef.current.focus();
      }
    });
  }, [finnConvo]);

  useEffect(() => {
    requestAnimationFrame(() => {
      if (aliceScrollRef.current) {
        aliceScrollRef.current.scrollTop = aliceScrollRef.current.scrollHeight;
      }
    });
  }, [aliceConvo]);

  useEffect(() => {
    requestAnimationFrame(() => {
      if (bobScrollRef.current) {
        bobScrollRef.current.scrollTop = bobScrollRef.current.scrollHeight;
      }
    });
  }, [bobConvo]);

  useEffect(() => {
    requestAnimationFrame(() => {
      if (charlieScrollRef.current) {
        charlieScrollRef.current.scrollTop = charlieScrollRef.current.scrollHeight;
      }
    });
  }, [charlieConvo]);

  useEffect(() => {
    requestAnimationFrame(() => {
      if (debugScrollRef.current) {
        debugScrollRef.current.scrollTop = debugScrollRef.current.scrollHeight;
      }
    });
  }, [debugEvents]);

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
          humanPlayerName: 'Finn',
          enabledRoles: enabledRoles || { detective: false, doctor: false }
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
          from: 'Orchestrator',
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
      // Show night action prompt based on role
      let nightPrompt = '';

      if (myRole === 'murderer') {
        nightPrompt = 'NIGHT PHASE: Choose your action. You can either "stay at your home" or "visit another player\'s HOME" (Alice, Bob, Charlie). Also specify if you have "intent to kill" (yes/no). IMPORTANT: If you visit someone, you go to THEIR home - they might not be there if they visited elsewhere!';
      } else if (myRole === 'detective') {
        nightPrompt = 'NIGHT PHASE: Who do you want to investigate tonight? Choose one player: Alice, Bob, Charlie';
      } else if (myRole === 'doctor') {
        nightPrompt = 'NIGHT PHASE: Who do you want to protect tonight? Choose one player (you can protect yourself): Alice, Bob, Charlie, Finn';
      } else {
        // Civilian
        nightPrompt = 'NIGHT PHASE: Choose your action. You can either "stay at your home" or "visit another player\'s HOME" (Alice, Bob, Charlie). IMPORTANT: If you visit someone, you go to THEIR home - they might not be there if they visited elsewhere!';
      }

      parseMessage({
        agent: 'Finn',
        from: 'Orchestrator',
        to: 'Finn',
        message: nightPrompt
      });

      setWaitingForFinn(true);

    } else if (phase.includes('_discussion')) {
      // Show discussion prompt
      parseMessage({
        agent: 'Finn',
        from: 'Orchestrator',
        to: 'Finn',
        message: 'DAY DISCUSSION: Make a public statement. Share what you saw, make accusations, or say anything.'
      });

      setWaitingForFinn(true);

    } else if (phase.includes('_voting')) {
      // Show voting prompt
      parseMessage({
        agent: 'Finn',
        from: 'Orchestrator',
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
            from: 'Orchestrator',
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
            to: 'Orchestrator',
            message: `${r.response}${r.reasoning ? `\n\n💭 Reasoning: ${r.reasoning}` : ''}`,
            isPrivate: true
          });
        });

        // Show observations privately to each agent
        data.observations.forEach((obs: any) => {
          parseMessage({
            agent: obs.agent,
            from: 'Orchestrator',
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
              from: 'Orchestrator',
              to: 'Everyone',
              message: `💀 ${data.deaths.join(', ')} died last night.`
            });
          });
        } else {
          ['Finn', 'Alice', 'Bob', 'Charlie'].forEach(agent => {
            parseMessage({
              agent,
              from: 'Orchestrator',
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
              from: 'Orchestrator',
              to: 'Finn',
              message: `💀 GAME OVER - You died!\n\n${data.winReason}\n\nThe game will continue among the AI agents, but your story ends here.`,
              isPrivate: true
            });
          } else {
            ['Finn', 'Alice', 'Bob', 'Charlie'].forEach(agent => {
              parseMessage({
                agent,
                from: 'Orchestrator',
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
            from: 'Orchestrator',
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
            from: 'Orchestrator',
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
            to: 'Orchestrator',
            message: `Vote: ${v.vote}${v.reasoning ? `\n\n💭 Reasoning: ${v.reasoning}` : ''}`,
            isPrivate: true
          });
        });

        // Show vote summary publicly
        ['Finn', 'Alice', 'Bob', 'Charlie'].forEach(agent => {
          const voteList = data.votes.map((v: any) => `${v.agent} → ${v.vote}`).join(', ');
          parseMessage({
            agent,
            from: 'Orchestrator',
            to: 'Everyone',
            message: `🗳️ Votes: ${voteList}`
          });
        });

        // Show result
        if (data.hanged) {
          ['Finn', 'Alice', 'Bob', 'Charlie'].forEach(agent => {
            parseMessage({
              agent,
              from: 'Orchestrator',
              to: 'Everyone',
              message: `⚖️ ${data.hanged} was hanged! They were: ${data.hangedRole.toUpperCase()}`
            });
          });
        } else {
          ['Finn', 'Alice', 'Bob', 'Charlie'].forEach(agent => {
            parseMessage({
              agent,
              from: 'Orchestrator',
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
              from: 'Orchestrator',
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
      to: currentPhase.includes('discussion') ? 'Everyone' : 'Orchestrator',
      message: response
    });

    // Process this phase
    await processPhase(currentPhase, response);
  };

  const ConversationColumn = ({ title, messages, bgColor, showInput, showRole, scrollRef, inputRef }: {
    title: string;
    messages: ConversationMessage[];
    bgColor: string;
    showInput?: boolean;
    showRole?: boolean;
    scrollRef?: React.RefObject<HTMLDivElement | null>;
    inputRef?: React.RefObject<HTMLInputElement | null>;
  }) => (
    <div className="flex-1 flex flex-col h-full">
      <div className={`${bgColor} text-white px-3 py-2 font-bold text-sm rounded-t-lg shadow-lg transition-colors duration-1000 ${
        darkMode ? 'shadow-black/50' : 'shadow-slate-900/30'
      }`}>
        {title}
        {showRole && myRole && (
          <span className={`ml-2 text-xs opacity-90 font-semibold px-2 py-0.5 rounded transition-colors duration-1000 ${
            myRole === 'murderer' ? 'bg-red-900/60 text-red-100' :
            myRole === 'detective' ? 'bg-blue-900/60 text-blue-100' :
            myRole === 'doctor' ? 'bg-cyan-900/60 text-cyan-100' :
            'bg-slate-700/60 text-slate-200'
          }`}>
            {myRole === 'murderer' ? '🔪 MURDERER' :
              myRole === 'detective' ? '🔍 DETECTIVE' :
              myRole === 'doctor' ? '⚕️ DOCTOR' :
              '👤 CIVILIAN'}
          </span>
        )}
      </div>
      <Card
        ref={scrollRef}
        className={`flex-1 rounded-t-none rounded-b-lg p-3 overflow-y-auto min-h-0 transition-colors duration-1000 ${
        darkMode
          ? 'bg-gradient-to-b from-slate-900 to-slate-800 border-slate-700 shadow-[inset_0_2px_20px_rgba(0,0,0,0.4)]'
          : 'bg-gradient-to-b from-white to-slate-50 border-slate-300 shadow-[inset_0_2px_10px_rgba(0,0,0,0.05)]'
      }`}>
        <div className="flex flex-col gap-2">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`px-3 py-2.5 rounded-lg text-sm transition-colors duration-1000 ${
                msg.isPrivate
                  ? darkMode
                    ? 'bg-gradient-to-br from-red-950/80 to-red-900/60 text-red-100 border border-red-700/70 shadow-lg shadow-red-900/30'
                    : 'bg-gradient-to-br from-red-50 to-red-100/50 text-red-950 border border-red-300 shadow-md shadow-red-200/40'
                  : msg.from === 'Orchestrator'
                  ? darkMode
                    ? 'bg-gradient-to-br from-blue-950/80 to-blue-900/60 text-blue-100 border border-blue-700/70 shadow-lg shadow-blue-900/30'
                    : 'bg-gradient-to-br from-blue-50 to-blue-100/50 text-blue-950 border border-blue-300 shadow-md shadow-blue-200/40'
                  : darkMode
                  ? 'bg-gradient-to-br from-slate-800 to-slate-700 text-slate-100 border border-slate-600 shadow-md shadow-black/40'
                  : 'bg-gradient-to-br from-slate-50 to-slate-100 text-slate-900 border border-slate-300 shadow-sm'
              }`}
            >
              <div className={`text-xs mb-1.5 font-semibold transition-colors duration-1000 ${
                darkMode ? 'text-slate-400' : 'text-slate-600'
              }`}>
                {msg.from} → {msg.to}
              </div>
              <div className="whitespace-pre-wrap leading-relaxed">{msg.message}</div>
            </div>
          ))}
          {showInput && waitingForFinn && !gameOver && (
            <div className="mt-2 flex gap-2">
              <Input
                ref={inputRef}
                type="text"
                placeholder={darkMode ? "Your response..." : "Your response..."}
                value={finnInput}
                onChange={(e) => setFinnInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    submitFinnResponse();
                  }
                }}
                className={`flex-1 transition-colors duration-1000 ${
                  darkMode
                    ? 'bg-slate-800 border-slate-600 text-slate-100 placeholder:text-slate-500 focus:border-red-700 focus:ring-red-700/50'
                    : 'border-slate-300 focus:border-red-400 focus:ring-red-400/50'
                }`}
                autoFocus
              />
              <Button
                onClick={submitFinnResponse}
                size="sm"
                className={`transition-colors duration-1000 ${
                  darkMode
                    ? 'bg-red-900 hover:bg-red-800 border border-red-700 shadow-lg shadow-red-900/30'
                    : 'bg-red-600 hover:bg-red-700 shadow-md'
                }`}
              >
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
      <div className={`px-3 py-2 font-bold text-sm rounded-t-lg shadow-lg transition-colors duration-1000 ${
        darkMode
          ? 'bg-gradient-to-r from-purple-950 to-slate-800 text-purple-200 shadow-black/50'
          : 'bg-gradient-to-r from-purple-700 to-slate-700 text-white shadow-slate-900/30'
      }`}>
        🔍 Orchestrator Debug
      </div>
      <Card
        ref={debugScrollRef}
        className={`flex-1 rounded-t-none rounded-b-lg p-3 overflow-y-auto min-h-0 font-mono text-xs transition-colors duration-1000 ${
        darkMode
          ? 'bg-gradient-to-b from-slate-950 to-slate-900 border-purple-900/50 shadow-[inset_0_2px_20px_rgba(0,0,0,0.4)]'
          : 'bg-gradient-to-b from-slate-800 to-slate-700 border-slate-600 shadow-[inset_0_2px_10px_rgba(0,0,0,0.3)]'
      }`}>
        <div className="flex flex-col gap-2">
          {debugEvents.map((event, i) => (
            <div key={i} className={`px-2 py-1.5 rounded border transition-colors duration-1000 ${
              darkMode
                ? 'bg-gradient-to-br from-slate-900 to-slate-800 text-slate-100 border-slate-700/70'
                : 'bg-gradient-to-br from-slate-700 to-slate-600 text-slate-100 border-slate-600'
            }`}>
              <div className={`font-semibold mb-1 transition-colors duration-1000 ${
                darkMode ? 'text-purple-400' : 'text-purple-300'
              }`}>
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
    <div className={`h-screen flex flex-col p-4 transition-colors duration-1000 ease-in-out relative overflow-hidden ${
      darkMode
        ? 'bg-gradient-to-br from-slate-950 via-slate-900 to-red-950/20'
        : 'bg-gradient-to-br from-slate-50 via-white to-orange-50/30'
    }`}>
      {/* Atmospheric background effects - always rendered but with opacity transitions */}
      <div className={`absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgba(139,0,0,0.15),transparent_50%)] pointer-events-none transition-opacity duration-1000 ease-in-out ${
        darkMode ? 'opacity-100' : 'opacity-0'
      }`} />
      <div className={`absolute inset-0 bg-[radial-gradient(circle_at_20%_80%,rgba(30,41,59,0.4),transparent_40%)] pointer-events-none transition-opacity duration-1000 ease-in-out ${
        darkMode ? 'opacity-100' : 'opacity-0'
      }`} />
      <div className={`absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-red-900/50 to-transparent transition-opacity duration-1000 ease-in-out ${
        darkMode ? 'opacity-100' : 'opacity-0'
      }`} />
      <div className={`absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(251,146,60,0.08),transparent_40%)] pointer-events-none transition-opacity duration-1000 ease-in-out ${
        darkMode ? 'opacity-0' : 'opacity-100'
      }`} />
      <div className={`absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0iZ3JpZCIgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBwYXR0ZXJuVW5pdHM9InVzZXJTcGFjZU9uVXNlIj48cGF0aCBkPSJNIDQwIDAgTCAwIDAgMCA0MCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJyZ2JhKDAsIDAsIDAsIDAuMDIpIiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-30 pointer-events-none transition-opacity duration-1000 ease-in-out ${
        darkMode ? 'opacity-0' : 'opacity-100'
      }`} />

      <div className="mb-3 flex items-center justify-between relative z-10">
        <div>
          <h1 className={`text-4xl font-black mb-1 transition-all duration-1000 tracking-tight ${
            darkMode
              ? 'text-transparent bg-clip-text bg-gradient-to-r from-red-200 via-red-300 to-red-500 drop-shadow-[0_0_25px_rgba(220,38,38,0.5)]'
              : 'text-transparent bg-clip-text bg-gradient-to-r from-red-800 via-red-600 to-orange-600 drop-shadow-[0_2px_8px_rgba(220,38,38,0.3)]'
          }`}>
            {darkMode ? '🌙 MURDER MYSTERY' : '🔪 MURDER MYSTERY'}
          </h1>
          <div className={`text-sm transition-colors duration-1000 font-medium ${
            darkMode ? 'text-red-300/70' : 'text-slate-700'
          }`}>
            Social deduction with isolated agent contexts
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={startGame}
            disabled={isLoading}
            className={`font-semibold px-6 transition-colors duration-1000 ${
              darkMode
                ? 'bg-gradient-to-r from-red-900 to-red-800 hover:from-red-800 hover:to-red-700 border border-red-700/50 shadow-lg shadow-red-900/40'
                : 'bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 shadow-md hover:shadow-lg'
            }`}
          >
            {isLoading ? 'Processing...' : currentPhase === 'init' ? '▶ Start Game' : '🔄 New Game'}
          </Button>
          <Button
            onClick={() => setShowAIBrains(!showAIBrains)}
            variant="outline"
            className={`transition-colors duration-1000 ${
              darkMode
                ? 'bg-slate-800 text-slate-100 border-slate-600 hover:bg-slate-700 hover:border-slate-500 shadow-lg shadow-black/20'
                : 'bg-white text-slate-900 border-slate-300 hover:bg-slate-50 hover:border-slate-400 shadow-md'
            }`}
          >
            {showAIBrains ? '👁️ Hide AI Brains' : '👁️ Show AI Brains'}
          </Button>
        </div>
      </div>

      {errorMsg && (
        <div className={`px-4 py-3 rounded-lg mb-3 font-semibold transition-colors duration-1000 ${
          darkMode
            ? 'bg-gradient-to-r from-red-950/80 to-red-900/60 text-red-200 border border-red-700/70 shadow-lg shadow-red-900/30'
            : 'bg-gradient-to-r from-red-100 to-red-50 text-red-900 border border-red-300 shadow-md'
        }`}>
          {errorMsg}
        </div>
      )}

      {currentPhase !== 'init' && (
        <div className={`px-4 py-3 rounded-lg mb-3 text-sm font-semibold transition-colors duration-1000 ${
          darkMode
            ? 'bg-gradient-to-r from-blue-950/80 to-slate-900/60 text-blue-200 border border-blue-700/70 shadow-lg shadow-blue-900/30'
            : 'bg-gradient-to-r from-blue-100 to-blue-50 text-blue-900 border border-blue-300 shadow-md'
        }`}>
          📍 Current Phase: <span className="font-bold text-base">{currentPhase}</span>
          {gameOver && <span className={`ml-4 font-bold text-base transition-colors duration-1000 ${
            darkMode ? 'text-green-400 drop-shadow-[0_0_8px_rgba(74,222,128,0.6)]' : 'text-green-700'
          }`}>🎮 GAME OVER - {winner?.toUpperCase()} WIN!</span>}
        </div>
      )}

      {/* 5-column layout (or 1-column if AI brains hidden) */}
      <div className="flex-1 flex gap-3 min-h-0 relative z-10">
        <ConversationColumn
          title="👤 Finn (You)"
          messages={finnConvo}
          bgColor={darkMode ? 'bg-gradient-to-r from-slate-700 to-slate-600' : 'bg-gradient-to-r from-slate-600 to-slate-500'}
          showInput={true}
          showRole={true}
          scrollRef={finnScrollRef}
          inputRef={inputRef}
        />
        {showAIBrains && (
          <>
            <ConversationColumn
              title="🦊 Alice"
              messages={aliceConvo}
              bgColor={darkMode ? 'bg-gradient-to-r from-orange-800 to-orange-700' : 'bg-gradient-to-r from-orange-600 to-orange-500'}
              scrollRef={aliceScrollRef}
            />
            <ConversationColumn
              title="🐻 Bob"
              messages={bobConvo}
              bgColor={darkMode ? 'bg-gradient-to-r from-blue-800 to-blue-700' : 'bg-gradient-to-r from-blue-600 to-blue-500'}
              scrollRef={bobScrollRef}
            />
            <ConversationColumn
              title="🦁 Charlie"
              messages={charlieConvo}
              bgColor={darkMode ? 'bg-gradient-to-r from-yellow-700 to-yellow-600' : 'bg-gradient-to-r from-yellow-600 to-yellow-500'}
              scrollRef={charlieScrollRef}
            />
            <DebugColumn />
          </>
        )}
      </div>
    </div>
  );
}
