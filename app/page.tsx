'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import MultiAgentView from '@/components/MultiAgentView';
import MurderMysteryView from '@/components/MurderMysteryView';

type GameView = 'welcome' | 'classic' | 'multi-agent' | 'strategic-sharing';

export default function Home() {
  const [view, setView] = useState<GameView>('welcome');
  const [showSetupDialog, setShowSetupDialog] = useState(false);
  const [selectedMode, setSelectedMode] = useState<'classic' | 'multi-agent' | null>(null);

  // Role selection state
  const [roles, setRoles] = useState({
    civilian: true,  // forced on
    detective: false,
    doctor: false,
    murderer: true,  // forced on
  });

  const handlePlayClick = (mode: 'classic' | 'multi-agent') => {
    setSelectedMode(mode);
    setShowSetupDialog(true);
  };

  const handleStartGame = () => {
    setShowSetupDialog(false);
    if (selectedMode) {
      setView(selectedMode);
    }
  };

  // Welcome screen
  if (view === 'welcome') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-black via-red-950/20 to-black flex items-center justify-center p-8 relative overflow-hidden">
        {/* Atmospheric background effects */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(139,0,0,0.1),transparent_50%)] pointer-events-none" />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0iZ3JpZCIgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBwYXR0ZXJuVW5pdHM9InVzZXJTcGFjZU9uVXNlIj48cGF0aCBkPSJNIDQwIDAgTCAwIDAgMCA0MCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMDIpIiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-20 pointer-events-none" />

        <div className="max-w-4xl w-full flex flex-col items-center space-y-12 relative z-10">
          {/* Title with dramatic styling */}
          <div className="text-center space-y-4">
            <h1 className="text-6xl md:text-7xl lg:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-b from-red-200 via-red-400 to-red-900 tracking-tight leading-none drop-shadow-[0_0_30px_rgba(139,0,0,0.5)]">
              MULTI-AGENT
            </h1>
            <h2 className="text-7xl md:text-8xl lg:text-9xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white via-red-100 to-red-600 tracking-tighter leading-none drop-shadow-[0_0_50px_rgba(220,38,38,0.8)] animate-pulse">
              MURDER
            </h2>
            <h3 className="text-6xl md:text-7xl lg:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-b from-red-200 via-red-400 to-red-900 tracking-tight leading-none drop-shadow-[0_0_30px_rgba(139,0,0,0.5)]">
              MYSTERY
            </h3>
            <p className="text-red-400/60 text-sm tracking-[0.3em] uppercase font-bold pt-4">
              A Social Deduction Game
            </p>
          </div>

          {/* Main Game Mode Buttons */}
          <div className="w-full max-w-md space-y-4 pt-8">
            <Button
              size="lg"
              className="w-full text-lg h-14 bg-gradient-to-r from-red-900 to-red-800 hover:from-red-800 hover:to-red-700 border border-red-700/50 shadow-[0_0_20px_rgba(139,0,0,0.3)] transition-all hover:shadow-[0_0_30px_rgba(139,0,0,0.5)] font-semibold"
              onClick={() => handlePlayClick('classic')}
            >
              Play Classic
            </Button>

            <Button
              size="lg"
              className="w-full text-lg h-14 bg-gradient-to-r from-slate-900 to-slate-800 hover:from-slate-800 hover:to-slate-700 border border-red-900/50 shadow-[0_0_20px_rgba(139,0,0,0.2)] transition-all hover:shadow-[0_0_30px_rgba(139,0,0,0.4)] font-semibold text-slate-100"
              onClick={() => handlePlayClick('multi-agent')}
            >
              Play with Multi-agent View
            </Button>
          </div>

          {/* Subtitle */}
          <p className="text-slate-500 text-sm italic">
            You can also change this at anytime during the game
          </p>

          {/* Game Rules Accordion */}
          <div className="w-full max-w-2xl">
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="rules" className="border-red-900/30 bg-black/40 backdrop-blur-sm rounded-lg px-4">
                <AccordionTrigger className="text-red-200 hover:text-red-100 font-semibold">
                  📜 Game Rules
                </AccordionTrigger>
                <AccordionContent className="text-slate-300 space-y-4">
                  <div className="prose prose-invert prose-sm max-w-none">
                    <h3 className="text-slate-100">Overview</h3>
                    <p>
                      A social deduction game where you (the human player) team up with 3 AI agents. One of you is secretly the murderer—can you figure out who before it&apos;s too late, or will you deceive the others if you&apos;re chosen as the killer?
                    </p>

                    <h3 className="text-slate-100 mt-6">Players</h3>
                    <p><strong>You (Human)</strong> + <strong>3 AI Agents</strong></p>
                    <p><strong>Roles:</strong> 1 Murderer (tries to eliminate all innocents) + 3 Innocents (try to identify the murderer)</p>
                    <p className="text-sm text-slate-400">Each player has isolated information—agents only know what they personally observe, just like you.</p>

                    <h3 className="text-slate-100 mt-6">Game Phases</h3>
                    <p className="font-mono text-xs bg-slate-800 p-2 rounded">
                      Role Assignment → Night 1 Actions → Death Announcement → Voting → Hanging (?) → Night 2 → repeat...
                    </p>

                    <h4 className="text-slate-200 mt-4">Night Actions</h4>
                    <p>All alive players simultaneously choose: <strong>Stay home</strong> or <strong>Visit another player&apos;s home</strong></p>
                    <p><strong>Killing Rules (for the Murderer):</strong></p>
                    <ul className="list-disc pl-5 space-y-1">
                      <li>3+ people at a home → Kill blocked privately (only murderer knows)</li>
                      <li>2 people at a home + murderer with intent → Other person dies</li>
                      <li>1 person alone → Cannot kill (no one else present)</li>
                    </ul>
                    <p className="text-yellow-400">⚠️ The murderer must attempt to kill at least once every two nights</p>

                    <h4 className="text-slate-200 mt-4">Day Phase: Discussion & Voting</h4>
                    <ol className="list-decimal pl-5 space-y-1">
                      <li>Death announcement (if any)</li>
                      <li>Each player makes a public statement</li>
                      <li>All players vote to hang someone or abstain</li>
                    </ol>
                    <p><strong>Voting:</strong> Need &gt;50% of non-abstaining votes (minimum 2 votes). Ties = no one hanged.</p>

                    <h3 className="text-slate-100 mt-6">Win Conditions</h3>
                    <p><strong>Innocents Win:</strong> Murderer is hanged</p>
                    <p><strong>Murderer Wins:</strong> All innocents eliminated OR 1-vs-1 situation</p>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>

          {/* Game Setup Dialog */}
          <Dialog open={showSetupDialog} onOpenChange={setShowSetupDialog}>
            <DialogContent className="sm:max-w-[500px] bg-gradient-to-b from-black to-red-950/20 border-red-900/50 shadow-[0_0_50px_rgba(139,0,0,0.3)]">
              <DialogHeader>
                <DialogTitle className="text-red-100 text-2xl font-bold">⚙️ Game Setup</DialogTitle>
                <DialogDescription className="text-slate-400">
                  Configure your game settings before starting
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6 py-4">
                {/* Role Selection Section */}
                <div className="space-y-4">
                  <h3 className="text-red-200 font-semibold text-lg">Select Roles to Include</h3>

                  {/* Civilian Role */}
                  <div className="flex items-center justify-between p-3 rounded-lg bg-black/50 border border-green-900/40 hover:border-green-800/60 transition-colors">
                    <HoverCard openDelay={300} closeDelay={200}>
                      <HoverCardTrigger asChild>
                        <span className="text-green-400 font-medium cursor-help">👥 Civilian</span>
                      </HoverCardTrigger>
                      <HoverCardContent className="bg-black border-green-900/50 text-slate-100">
                        <p className="text-sm">Can move between homes at night. No special abilities.</p>
                      </HoverCardContent>
                    </HoverCard>
                    <Switch
                      checked={roles.civilian}
                      disabled={true}
                      className="data-[state=checked]:bg-slate-500 data-[state=unchecked]:bg-slate-600 opacity-50"
                    />
                  </div>

                  {/* Detective Role */}
                  <div className="flex items-center justify-between p-3 rounded-lg bg-black/50 border border-blue-900/40 hover:border-blue-800/60 transition-colors">
                    <HoverCard openDelay={300} closeDelay={200}>
                      <HoverCardTrigger asChild>
                        <span className="text-blue-400 font-medium cursor-help">🔍 Detective</span>
                      </HoverCardTrigger>
                      <HoverCardContent className="bg-black border-blue-900/50 text-slate-100">
                        <p className="text-sm">Can investigate one player each night to learn their role.</p>
                      </HoverCardContent>
                    </HoverCard>
                    <Switch
                      checked={roles.detective}
                      onCheckedChange={(checked) => setRoles({ ...roles, detective: checked })}
                      className="data-[state=checked]:bg-blue-600 data-[state=unchecked]:bg-slate-700"
                    />
                  </div>

                  {/* Doctor Role */}
                  <div className="flex items-center justify-between p-3 rounded-lg bg-black/50 border border-cyan-900/40 hover:border-cyan-800/60 transition-colors">
                    <HoverCard openDelay={300} closeDelay={200}>
                      <HoverCardTrigger asChild>
                        <span className="text-cyan-400 font-medium cursor-help">⚕️ Doctor</span>
                      </HoverCardTrigger>
                      <HoverCardContent className="bg-black border-cyan-900/50 text-slate-100">
                        <p className="text-sm">Can protect one player each night from being killed.</p>
                      </HoverCardContent>
                    </HoverCard>
                    <Switch
                      checked={roles.doctor}
                      onCheckedChange={(checked) => setRoles({ ...roles, doctor: checked })}
                      className="data-[state=checked]:bg-cyan-600 data-[state=unchecked]:bg-slate-700"
                    />
                  </div>

                  {/* Murderer Role */}
                  <div className="flex items-center justify-between p-3 rounded-lg bg-black/50 border border-red-900/60 hover:border-red-800/80 transition-colors shadow-[0_0_15px_rgba(139,0,0,0.2)]">
                    <HoverCard openDelay={300} closeDelay={200}>
                      <HoverCardTrigger asChild>
                        <span className="text-red-400 font-medium cursor-help">🔪 Murderer</span>
                      </HoverCardTrigger>
                      <HoverCardContent className="bg-black border-red-900/50 text-slate-100">
                        <p className="text-sm">Can kill players when alone with them at night. Must attempt to kill at least once every two nights.</p>
                      </HoverCardContent>
                    </HoverCard>
                    <Switch
                      checked={roles.murderer}
                      disabled={true}
                      className="data-[state=checked]:bg-red-700 data-[state=unchecked]:bg-slate-600 opacity-50"
                    />
                  </div>
                </div>

                {/* Start Button */}
                <Button
                  onClick={handleStartGame}
                  className="w-full bg-gradient-to-r from-red-900 to-red-800 hover:from-red-800 hover:to-red-700 border border-red-700/50 shadow-[0_0_20px_rgba(139,0,0,0.3)] font-semibold"
                  size="lg"
                >
                  🎭 Start Game
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    );
  }

  // If strategic sharing mode, show multi-agent view
  if (view === 'strategic-sharing') {
    return <MultiAgentView onBackToExample={() => setView('welcome')} />;
  }

  // Multi-agent view mode
  if (view === 'multi-agent') {
    return <MurderMysteryView
      onSwitchMode={() => setView('strategic-sharing')}
      enabledRoles={{ detective: roles.detective, doctor: roles.doctor }}
      initialShowAIBrains={true}
    />;
  }

  // Classic mode - AI Brains hidden by default
  if (view === 'classic') {
    return <MurderMysteryView
      onSwitchMode={() => setView('strategic-sharing')}
      enabledRoles={{ detective: roles.detective, doctor: roles.doctor }}
      initialShowAIBrains={false}
    />;
  }

  return null;
}
