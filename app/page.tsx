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
      <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 flex items-center justify-center p-8">
        <div className="max-w-3xl w-full flex flex-col items-center space-y-8">
          {/* Title */}
          <h1 className="text-8xl font-bold text-white tracking-wider">M3</h1>

          {/* Main Game Mode Buttons */}
          <div className="w-full max-w-md space-y-4">
            <Button
              size="lg"
              className="w-full text-lg h-14 bg-blue-600 hover:bg-blue-700"
              onClick={() => handlePlayClick('classic')}
            >
              Play Classic
            </Button>

            <Button
              size="lg"
              className="w-full text-lg h-14 bg-purple-600 hover:bg-purple-700"
              onClick={() => handlePlayClick('multi-agent')}
            >
              Play with Multi-agent View
            </Button>
          </div>

          {/* Subtitle */}
          <p className="text-slate-400 text-sm">
            You can also change this at anytime during the game
          </p>

          {/* Game Rules Accordion */}
          <div className="w-full max-w-2xl">
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="rules" className="border-slate-700">
                <AccordionTrigger className="text-slate-200 hover:text-white">
                  Game Rules
                </AccordionTrigger>
                <AccordionContent className="text-slate-300 space-y-4">
                  <div className="prose prose-invert prose-sm max-w-none">
                    <h3 className="text-slate-100">Overview</h3>
                    <p>
                      A social deduction game for 4+ players and 1 Game Master. Players take on secret roles and must either identify the murderer or survive as the murderer without being caught.
                    </p>

                    <h3 className="text-slate-100 mt-6">Setup</h3>
                    <p><strong>Players:</strong> 4 Playing Players + 1 Game Master</p>
                    <p><strong>Roles:</strong> 1 Murderer (tries to eliminate all innocents) + All others are Innocents (try to identify the murderer)</p>

                    <h3 className="text-slate-100 mt-6">Game Phases</h3>
                    <p className="font-mono text-xs bg-slate-800 p-2 rounded">
                      Day 0 (Introductions) → Night 1 → Day 1 → Night 2 → Day 2 → ...
                    </p>

                    <h4 className="text-slate-200 mt-4">Night Phase</h4>
                    <p>All alive players simultaneously choose: <strong>Stay home</strong> or <strong>Visit another player&apos;s home</strong></p>
                    <p><strong>Killing Rules:</strong></p>
                    <ul className="list-disc pl-5 space-y-1">
                      <li>3+ people at a home → Safe (too many witnesses)</li>
                      <li>2 people at a home + murderer with intent → Other person dies</li>
                      <li>1 person alone → Safe</li>
                    </ul>
                    <p className="text-yellow-400">⚠️ The murderer must attempt to kill at least once every two nights</p>

                    <h4 className="text-slate-200 mt-4">Day Phase: Discussion & Voting</h4>
                    <ol className="list-decimal pl-5 space-y-1">
                      <li>Death announcement (if any)</li>
                      <li>Each player makes a public statement</li>
                      <li>Players vote to hang someone or abstain</li>
                    </ol>
                    <p><strong>Voting:</strong> Need &gt;50% of non-abstaining votes (minimum 2 votes). Ties = no one hanged.</p>

                    <h3 className="text-slate-100 mt-6">Information Rules</h3>
                    <p><strong className="text-green-400">FACTS (100% True):</strong></p>
                    <ul className="list-disc pl-5 space-y-1">
                      <li>Who was at your location during the night</li>
                      <li>Role reveals when someone is hanged</li>
                    </ul>
                    <p><strong className="text-red-400">ALLEGED INFO (May Be Lies):</strong></p>
                    <ul className="list-disc pl-5 space-y-1">
                      <li>Player statements and claims</li>
                      <li>Remember: The murderer can and should lie!</li>
                    </ul>

                    <h3 className="text-slate-100 mt-6">Win Conditions</h3>
                    <p><strong>Innocents Win:</strong> Murderer is hanged</p>
                    <p><strong>Murderer Wins:</strong> All innocents dead OR 1-vs-1 situation</p>

                    <h3 className="text-slate-100 mt-6">Strategy Tips</h3>
                    <p><strong>For Innocents:</strong> Share facts, look for contradictions, work together</p>
                    <p><strong>For Murderer:</strong> Blend in, craft careful lies, create suspicion between innocents</p>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>

          {/* Game Setup Dialog */}
          <Dialog open={showSetupDialog} onOpenChange={setShowSetupDialog}>
            <DialogContent className="sm:max-w-[500px] bg-slate-900 border-slate-700">
              <DialogHeader>
                <DialogTitle className="text-slate-100 text-2xl">Game Setup</DialogTitle>
                <DialogDescription className="text-slate-400">
                  Configure your game settings before starting
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6 py-4">
                {/* Role Selection Section */}
                <div className="space-y-4">
                  <h3 className="text-slate-200 font-semibold text-lg">Select Roles to Include</h3>

                  {/* Civilian Role */}
                  <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 border border-green-900/30">
                    <span className="text-green-400 font-medium">Civilian</span>
                    <Switch
                      checked={roles.civilian}
                      disabled={true}
                      className="data-[state=checked]:bg-slate-500 data-[state=unchecked]:bg-slate-600 opacity-50"
                    />
                  </div>

                  {/* Detective Role */}
                  <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 border border-green-900/30">
                    <span className="text-green-400 font-medium">Detective</span>
                    <Switch
                      checked={roles.detective}
                      onCheckedChange={(checked) => setRoles({ ...roles, detective: checked })}
                      className="data-[state=checked]:bg-slate-500 data-[state=unchecked]:bg-slate-600"
                    />
                  </div>

                  {/* Doctor Role */}
                  <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 border border-green-900/30">
                    <span className="text-green-400 font-medium">Doctor</span>
                    <Switch
                      checked={roles.doctor}
                      onCheckedChange={(checked) => setRoles({ ...roles, doctor: checked })}
                      className="data-[state=checked]:bg-slate-500 data-[state=unchecked]:bg-slate-600"
                    />
                  </div>

                  {/* Murderer Role */}
                  <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 border border-red-900/30">
                    <span className="text-red-400 font-medium">Murderer</span>
                    <Switch
                      checked={roles.murderer}
                      disabled={true}
                      className="data-[state=checked]:bg-slate-500 data-[state=unchecked]:bg-slate-600 opacity-50"
                    />
                  </div>
                </div>

                {/* Start Button */}
                <Button
                  onClick={handleStartGame}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                  size="lg"
                >
                  Start Game
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
    />;
  }

  // Classic mode (TODO: implement separate classic view)
  if (view === 'classic') {
    return <MurderMysteryView
      onSwitchMode={() => setView('strategic-sharing')}
      enabledRoles={{ detective: roles.detective, doctor: roles.doctor }}
    />;
  }

  return null;
}
