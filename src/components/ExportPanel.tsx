import { useState } from 'react';
import { Download, Copy, Share2, Check } from 'lucide-react';
import { useGameStore } from '../store/gameStore';

export default function ExportPanel() {
  const { pgn, analysis } = useGameStore();
  const [copied, setCopied] = useState(false);

  const downloadPgn = () => {
    const headers = [
      `[Event "ChessMate Analysis"]`,
      `[Date "${new Date().toISOString().split('T')[0]}"]`,
      `[Opening "${analysis?.opening || 'Unknown'}"]`,
      `[Result "${analysis?.result || '*'}"]`,
      `[WhiteAccuracy "${analysis?.whiteAccuracy || 0}%"]`,
      `[BlackAccuracy "${analysis?.blackAccuracy || 0}%"]`,
      '',
    ].join('\n');

    const blob = new Blob([headers + pgn], { type: 'application/x-chess-pgn' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chessmate_${Date.now()}.pgn`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyPgn = async () => {
    await navigator.clipboard.writeText(pgn);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareGame = async () => {
    const text = `Check out this chess game analysis on ChessMate!\n\n${pgn}`;
    if (navigator.share) {
      await navigator.share({ title: 'ChessMate Analysis', text });
    } else {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={downloadPgn}
        className="flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors text-sm text-gray-300 hover:text-white"
      >
        <Download className="w-4 h-4" />
        PGN
      </button>
      <button
        onClick={copyPgn}
        className="flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors text-sm text-gray-300 hover:text-white"
      >
        {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
        {copied ? 'Copied' : 'Copy'}
      </button>
      <button
        onClick={shareGame}
        className="flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors text-sm text-gray-300 hover:text-white"
      >
        <Share2 className="w-4 h-4" />
        Share
      </button>
    </div>
  );
}
