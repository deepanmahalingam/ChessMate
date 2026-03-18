import { useState } from 'react';
import {
  BookOpen, Target, Lightbulb, AlertTriangle,
  TrendingUp, Zap, User, ChevronDown, ChevronUp,
} from 'lucide-react';
import { useGameStore } from '../store/gameStore';

export default function GameSummary() {
  const { analysis } = useGameStore();
  const [mode, setMode] = useState<'beginner' | 'advanced'>('beginner');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['overview']));

  if (!analysis?.summary) return null;

  const { summary } = analysis;

  const toggleSection = (key: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const Section = ({ id, icon: Icon, title, children }: { id: string; icon: React.ElementType; title: string; children: React.ReactNode }) => {
    const isExpanded = expandedSections.has(id);
    return (
      <div className="border border-white/10 rounded-xl overflow-hidden">
        <button
          onClick={() => toggleSection(id)}
          className="w-full flex items-center gap-3 p-4 hover:bg-white/5 transition-colors text-left"
        >
          <Icon className="w-5 h-5 text-accent shrink-0" />
          <span className="font-medium text-white flex-1">{title}</span>
          {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </button>
        {isExpanded && (
          <div className="px-4 pb-4 pt-0 text-sm text-gray-300 leading-relaxed">
            {children}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Mode Toggle */}
      <div className="flex items-center gap-2 justify-center">
        <button
          onClick={() => setMode('beginner')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            mode === 'beginner' ? 'bg-accent text-white' : 'bg-white/5 text-gray-400 hover:text-white'
          }`}
        >
          Beginner
        </button>
        <button
          onClick={() => setMode('advanced')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            mode === 'advanced' ? 'bg-accent text-white' : 'bg-white/5 text-gray-400 hover:text-white'
          }`}
        >
          Advanced
        </button>
      </div>

      {/* Summary Text */}
      <div className="bg-gradient-to-br from-accent/10 to-accent-light/5 rounded-xl p-4 border border-accent/20">
        <p className="text-sm text-gray-200 leading-relaxed">
          {mode === 'beginner' ? summary.beginnerSummary : summary.advancedSummary}
        </p>
      </div>

      {/* Sections */}
      <div className="space-y-2">
        <Section id="overview" icon={BookOpen} title="Game Overview">
          <p>{summary.overview}</p>
        </Section>

        <Section id="opening" icon={BookOpen} title="Opening Phase">
          <p>{summary.opening}</p>
        </Section>

        <Section id="middlegame" icon={Target} title="Middlegame">
          <p>{summary.middlegame}</p>
        </Section>

        <Section id="endgame" icon={TrendingUp} title="Endgame">
          <p>{summary.endgame}</p>
        </Section>

        {summary.criticalMistakes.length > 0 && (
          <Section id="mistakes" icon={AlertTriangle} title="Critical Mistakes">
            <ul className="list-disc list-inside space-y-1">
              {summary.criticalMistakes.map((m, i) => <li key={i}>{m}</li>)}
            </ul>
          </Section>
        )}

        <Section id="tactical" icon={Zap} title="Tactical Themes">
          <div className="flex flex-wrap gap-2">
            {summary.tacticalThemes.map((t, i) => (
              <span key={i} className="px-2 py-1 bg-white/5 rounded-md text-xs">{t}</span>
            ))}
          </div>
        </Section>

        <Section id="strategic" icon={Lightbulb} title="Strategic Themes">
          <div className="flex flex-wrap gap-2">
            {summary.strategicThemes.map((t, i) => (
              <span key={i} className="px-2 py-1 bg-white/5 rounded-md text-xs">{t}</span>
            ))}
          </div>
        </Section>

        <Section id="players" icon={User} title="Player Analysis">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="font-semibold text-white text-xs mb-2">White</h4>
              <div className="mb-2">
                <span className="text-xs text-green-400">Strengths:</span>
                <ul className="list-disc list-inside text-xs mt-1 space-y-0.5">
                  {summary.whiteStrengths.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
              <div>
                <span className="text-xs text-red-400">Weaknesses:</span>
                <ul className="list-disc list-inside text-xs mt-1 space-y-0.5">
                  {summary.whiteWeaknesses.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            </div>
            <div>
              <h4 className="font-semibold text-gray-300 text-xs mb-2">Black</h4>
              <div className="mb-2">
                <span className="text-xs text-green-400">Strengths:</span>
                <ul className="list-disc list-inside text-xs mt-1 space-y-0.5">
                  {summary.blackStrengths.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
              <div>
                <span className="text-xs text-red-400">Weaknesses:</span>
                <ul className="list-disc list-inside text-xs mt-1 space-y-0.5">
                  {summary.blackWeaknesses.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            </div>
          </div>
        </Section>
      </div>

      {/* Key Moments */}
      {analysis.keyMoments.length > 0 && (
        <div className="bg-white/5 rounded-xl p-4 border border-white/10">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Key Moments</h3>
          <div className="space-y-2">
            {analysis.keyMoments.map((moment, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-mono ${
                  moment.type === 'blunder' ? 'bg-red-500/20 text-red-400' :
                  moment.type === 'brilliant' ? 'bg-teal-500/20 text-teal-400' :
                  'bg-yellow-500/20 text-yellow-400'
                }`}>
                  #{moment.moveNumber}
                </span>
                <span className="text-gray-400">{moment.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
