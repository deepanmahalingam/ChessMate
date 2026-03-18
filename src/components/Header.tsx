import { Crown } from 'lucide-react';

interface HeaderProps {
  onNavigate: (page: 'home' | 'analysis') => void;
  currentPage: string;
}

export default function Header({ onNavigate, currentPage }: HeaderProps) {
  return (
    <header className="border-b border-white/10 backdrop-blur-md bg-white/5 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <button
            onClick={() => onNavigate('home')}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <Crown className="w-8 h-8 text-accent" />
            <span className="text-xl font-bold bg-gradient-to-r from-accent to-accent-light bg-clip-text text-transparent">
              ChessMate
            </span>
          </button>

          <nav className="flex items-center gap-6">
            <button
              onClick={() => onNavigate('home')}
              className={`text-sm font-medium transition-colors ${
                currentPage === 'home' ? 'text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              Upload
            </button>
            <button
              onClick={() => onNavigate('analysis')}
              className={`text-sm font-medium transition-colors ${
                currentPage === 'analysis' ? 'text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              Analysis
            </button>
          </nav>
        </div>
      </div>
    </header>
  );
}
