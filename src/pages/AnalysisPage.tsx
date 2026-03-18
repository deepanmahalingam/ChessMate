import { useState } from 'react';
import { BarChart3, MessageSquare, ListChecks } from 'lucide-react';
import ChessReplay from '../components/ChessReplay';
import EvalBar from '../components/EvalBar';
import EvalGraph from '../components/EvalGraph';
import MoveList from '../components/MoveList';
import GameStats from '../components/GameStats';
import GameSummary from '../components/GameSummary';
import ExportPanel from '../components/ExportPanel';
import { useGameStore } from '../store/gameStore';

export default function AnalysisPage() {
  const { analysis } = useGameStore();
  const [tab, setTab] = useState<'moves' | 'stats' | 'summary'>('moves');

  if (!analysis) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-gray-400">
        <p>No analysis yet. Upload a video or paste PGN to get started.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Top bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">Game Analysis</h2>
          <p className="text-sm text-gray-400">{analysis.opening} &middot; {analysis.result} &middot; {analysis.moves.length} moves</p>
        </div>
        <ExportPanel />
      </div>

      {/* Main layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr_320px] gap-6">
        {/* Eval Bar - hidden on mobile */}
        <div className="hidden lg:block">
          <EvalBar />
        </div>

        {/* Center: Board + Graph */}
        <div className="flex flex-col gap-4">
          <ChessReplay />
          <EvalGraph />
        </div>

        {/* Right Panel */}
        <div className="flex flex-col gap-4">
          {/* Tabs */}
          <div className="flex gap-1 bg-white/5 rounded-xl p-1">
            <button
              onClick={() => setTab('moves')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                tab === 'moves' ? 'bg-accent text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              <ListChecks className="w-3.5 h-3.5" />
              Moves
            </button>
            <button
              onClick={() => setTab('stats')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                tab === 'stats' ? 'bg-accent text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Stats
            </button>
            <button
              onClick={() => setTab('summary')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                tab === 'summary' ? 'bg-accent text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Summary
            </button>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-hidden">
            {tab === 'moves' && <MoveList />}
            {tab === 'stats' && <GameStats />}
            {tab === 'summary' && <GameSummary />}
          </div>
        </div>
      </div>
    </div>
  );
}
