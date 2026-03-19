import { useState } from 'react';
import { Crown, Cpu, Eye, BarChart3, FileText, Zap, ImageIcon, FileVideo } from 'lucide-react';
import VideoUpload from '../components/VideoUpload';
import ImageUpload from '../components/ImageUpload';

interface HomePageProps {
  onAnalysisComplete: () => void;
}

type InputMode = 'video' | 'image';

export default function HomePage({ onAnalysisComplete }: HomePageProps) {
  const [mode, setMode] = useState<InputMode>('video');

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      {/* Hero */}
      <div className="text-center py-12 px-4">
        <div className="flex items-center justify-center gap-3 mb-6">
          <Crown className="w-12 h-12 text-accent" />
        </div>
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-4 tracking-tight">
          AI Chess Game
          <span className="bg-gradient-to-r from-accent to-accent-light bg-clip-text text-transparent"> Analyzer</span>
        </h1>
        <p className="text-lg text-gray-400 max-w-2xl mx-auto mb-2">
          Upload a chess game video, board images, or paste PGN notation to get an interactive replay
          with deep engine analysis and AI-powered insights.
        </p>
        <p className="text-sm text-gray-500 mb-8">
          Powered by Stockfish engine analysis
        </p>

        {/* Input Mode Tabs */}
        <div className="flex gap-2 justify-center mb-8">
          <button
            onClick={() => setMode('video')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm transition-all ${
              mode === 'video'
                ? 'bg-accent text-white shadow-lg shadow-accent/25'
                : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white border border-white/10'
            }`}
          >
            <FileVideo className="w-4 h-4" />
            Video / PGN
          </button>
          <button
            onClick={() => setMode('image')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm transition-all ${
              mode === 'image'
                ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/25'
                : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white border border-white/10'
            }`}
          >
            <ImageIcon className="w-4 h-4" />
            Board Images
          </button>
        </div>

        {/* Input Components */}
        {mode === 'video' && <VideoUpload onAnalysisComplete={onAnalysisComplete} />}
        {mode === 'image' && <ImageUpload onAnalysisComplete={onAnalysisComplete} />}
      </div>

      {/* Features */}
      <div className="max-w-5xl mx-auto px-4 pb-16">
        <h2 className="text-center text-sm font-semibold text-gray-500 uppercase tracking-wider mb-8">
          What you get
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { icon: Eye, title: 'Video Detection', desc: 'Computer vision extracts moves from chess game recordings' },
            { icon: ImageIcon, title: 'Image Recognition', desc: 'Upload board screenshots to detect positions and reconstruct games' },
            { icon: Cpu, title: 'Engine Analysis', desc: 'Every move evaluated for accuracy, blunders, and best alternatives' },
            { icon: BarChart3, title: 'Evaluation Graph', desc: 'Visual advantage timeline showing the flow of the game' },
            { icon: Zap, title: 'Move Classification', desc: 'Brilliant, great, good, inaccuracy, mistake, and blunder ratings' },
            { icon: FileText, title: 'AI Summary', desc: 'Natural-language game report for beginners and advanced players' },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="p-5 bg-white/5 rounded-xl border border-white/10 hover:border-accent/30 transition-colors">
              <Icon className="w-8 h-8 text-accent mb-3" />
              <h3 className="text-white font-semibold mb-1">{title}</h3>
              <p className="text-sm text-gray-400">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
