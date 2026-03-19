import { useState, useCallback, useEffect } from 'react';
import { Chess } from 'chess.js';
import {
  RotateCcw, Trash2, Copy, Check,
} from 'lucide-react';

interface BoardEditorProps {
  initialFen: string;
  onFenChange: (fen: string) => void;
  onClose: () => void;
  inlineMode?: boolean; // When true, auto-saves on every change, hides Cancel/Apply buttons
}

type PieceType = 'K' | 'Q' | 'R' | 'B' | 'N' | 'P' | 'k' | 'q' | 'r' | 'b' | 'n' | 'p';

const PIECE_SYMBOLS: Record<string, string> = {
  'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙',
  'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟',
};

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];

export default function BoardEditor({ initialFen, onFenChange, onClose, inlineMode = false }: BoardEditorProps) {
  const [board, setBoard] = useState<(PieceType | null)[][]>(() => parseFenToBoard(initialFen));
  const [selectedPiece, setSelectedPiece] = useState<PieceType | null>(null);
  const [eraseMode, setEraseMode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sideToMove, setSideToMove] = useState<'w' | 'b'>('w');

  function parseFenToBoard(fen: string): (PieceType | null)[][] {
    const boardPart = fen.split(' ')[0];
    const rows = boardPart.split('/');
    const result: (PieceType | null)[][] = [];

    for (let r = 0; r < 8; r++) {
      const row: (PieceType | null)[] = [];
      const rankStr = rows[r] || '8';
      for (const ch of rankStr) {
        if (ch >= '1' && ch <= '8') {
          for (let i = 0; i < parseInt(ch); i++) row.push(null);
        } else {
          row.push(ch as PieceType);
        }
      }
      while (row.length < 8) row.push(null);
      result.push(row.slice(0, 8));
    }
    while (result.length < 8) result.push(Array(8).fill(null));
    return result;
  }

  function boardToFen(b: (PieceType | null)[][]): string {
    const ranks: string[] = [];
    for (let r = 0; r < 8; r++) {
      let rank = '';
      let empty = 0;
      for (let c = 0; c < 8; c++) {
        if (b[r][c]) {
          if (empty > 0) { rank += empty; empty = 0; }
          rank += b[r][c];
        } else {
          empty++;
        }
      }
      if (empty > 0) rank += empty;
      ranks.push(rank);
    }

    // Determine castling rights
    let castling = '';
    if (b[7]?.[4] === 'K') {
      if (b[7]?.[7] === 'R') castling += 'K';
      if (b[7]?.[0] === 'R') castling += 'Q';
    }
    if (b[0]?.[4] === 'k') {
      if (b[0]?.[7] === 'r') castling += 'k';
      if (b[0]?.[0] === 'r') castling += 'q';
    }
    if (!castling) castling = '-';

    return `${ranks.join('/')} ${sideToMove} ${castling} - 0 1`;
  }

  const handleSquareClick = useCallback((row: number, col: number) => {
    setBoard(prev => {
      const next = prev.map(r => [...r]);
      if (eraseMode) {
        next[row][col] = null;
      } else if (selectedPiece) {
        // If same piece is already there, remove it (toggle)
        if (next[row][col] === selectedPiece) {
          next[row][col] = null;
        } else {
          next[row][col] = selectedPiece;
        }
      } else {
        // No piece selected — cycle through removing or show what's there
        next[row][col] = null;
      }
      return next;
    });
  }, [selectedPiece, eraseMode]);

  const handleReset = () => {
    setBoard(parseFenToBoard('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'));
  };

  const handleClear = () => {
    setBoard(Array(8).fill(null).map(() => Array(8).fill(null)));
  };

  const handleSave = () => {
    const fen = boardToFen(board);
    // Validate
    try {
      new Chess(fen);
      onFenChange(fen);
      onClose();
    } catch {
      // If invalid, try without castling
      const simpleFen = boardToFen(board).replace(/[KQkq]+/, '-');
      try {
        new Chess(simpleFen);
        onFenChange(simpleFen);
        onClose();
      } catch {
        // Just pass the FEN as-is and let the user know
        onFenChange(fen);
        onClose();
      }
    }
  };

  const handleCopyFen = () => {
    navigator.clipboard.writeText(boardToFen(board));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const currentFen = boardToFen(board);

  // In inline mode, auto-save FEN changes back to parent
  useEffect(() => {
    if (inlineMode) {
      // Validate and send
      try {
        new Chess(currentFen);
        onFenChange(currentFen);
      } catch {
        // Try without castling
        const simpleFen = currentFen.replace(/[KQkq]+(?= )/, '-');
        try {
          new Chess(simpleFen);
          onFenChange(simpleFen);
        } catch {
          // Invalid position, don't update
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFen, inlineMode]);

  return (
    <div className="bg-gray-900/95 backdrop-blur-sm rounded-2xl border border-white/10 p-4 space-y-4">
      <div className="text-center">
        <h3 className="text-lg font-bold text-white">Board Editor</h3>
        <p className="text-xs text-gray-400 mt-1">Click a piece below, then click squares to place it</p>
      </div>

      {/* Piece palette */}
      <div className="space-y-2">
        <div className="flex items-center justify-center gap-1">
          <span className="text-[10px] text-gray-500 w-10">White:</span>
          {(['K', 'Q', 'R', 'B', 'N', 'P'] as PieceType[]).map(p => (
            <button
              key={p}
              onClick={() => { setSelectedPiece(p); setEraseMode(false); }}
              className={`w-9 h-9 rounded-lg text-xl flex items-center justify-center transition-all ${
                selectedPiece === p && !eraseMode
                  ? 'bg-purple-500/30 border-2 border-purple-400 scale-110'
                  : 'bg-white/5 border border-white/10 hover:bg-white/10'
              }`}
              title={p}
            >
              {PIECE_SYMBOLS[p]}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-center gap-1">
          <span className="text-[10px] text-gray-500 w-10">Black:</span>
          {(['k', 'q', 'r', 'b', 'n', 'p'] as PieceType[]).map(p => (
            <button
              key={p}
              onClick={() => { setSelectedPiece(p); setEraseMode(false); }}
              className={`w-9 h-9 rounded-lg text-xl flex items-center justify-center transition-all ${
                selectedPiece === p && !eraseMode
                  ? 'bg-purple-500/30 border-2 border-purple-400 scale-110'
                  : 'bg-white/5 border border-white/10 hover:bg-white/10'
              }`}
              title={p}
            >
              {PIECE_SYMBOLS[p]}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => { setEraseMode(true); setSelectedPiece(null); }}
            className={`px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 transition-all ${
              eraseMode
                ? 'bg-red-500/20 border-2 border-red-400 text-red-400'
                : 'bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10'
            }`}
          >
            <Trash2 className="w-3 h-3" /> Erase
          </button>
          <button
            onClick={handleReset}
            className="px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10"
          >
            <RotateCcw className="w-3 h-3" /> Reset
          </button>
          <button
            onClick={handleClear}
            className="px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10"
          >
            <Trash2 className="w-3 h-3" /> Clear All
          </button>
        </div>
      </div>

      {/* Interactive board */}
      <div className="flex justify-center">
        <div className="inline-block">
          {/* Column labels */}
          <div className="flex ml-6">
            {FILES.map(f => (
              <div key={f} className="w-9 h-4 flex items-center justify-center text-[10px] text-gray-500 font-mono">
                {f}
              </div>
            ))}
          </div>
          <div className="flex">
            {/* Row labels */}
            <div className="flex flex-col">
              {RANKS.map(r => (
                <div key={r} className="w-6 h-9 flex items-center justify-center text-[10px] text-gray-500 font-mono">
                  {r}
                </div>
              ))}
            </div>
            {/* Board grid */}
            <div className="border border-gray-600 rounded overflow-hidden">
              {board.map((row, r) => (
                <div key={r} className="flex">
                  {row.map((piece, c) => {
                    const isLight = (r + c) % 2 === 0;
                    return (
                      <button
                        key={`${r}-${c}`}
                        onClick={() => handleSquareClick(r, c)}
                        className={`w-9 h-9 flex items-center justify-center text-xl transition-all hover:opacity-80 active:scale-95 ${
                          isLight ? 'bg-[#f0d9b5]' : 'bg-[#b58863]'
                        }`}
                        title={`${FILES[c]}${RANKS[r]}`}
                      >
                        {piece ? PIECE_SYMBOLS[piece] : ''}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Side to move */}
      <div className="flex items-center justify-center gap-3">
        <span className="text-xs text-gray-400">Side to move:</span>
        <button
          onClick={() => setSideToMove('w')}
          className={`px-3 py-1 rounded-lg text-xs font-medium ${
            sideToMove === 'w'
              ? 'bg-white/20 text-white border border-white/30'
              : 'bg-white/5 text-gray-400 border border-white/10'
          }`}
        >
          White
        </button>
        <button
          onClick={() => setSideToMove('b')}
          className={`px-3 py-1 rounded-lg text-xs font-medium ${
            sideToMove === 'b'
              ? 'bg-gray-600 text-white border border-gray-500'
              : 'bg-white/5 text-gray-400 border border-white/10'
          }`}
        >
          Black
        </button>
      </div>

      {/* FEN display */}
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-black/30 rounded-lg px-3 py-2 font-mono text-[10px] text-gray-300 truncate">
          {currentFen}
        </div>
        <button
          onClick={handleCopyFen}
          className="shrink-0 p-2 bg-white/5 rounded-lg text-gray-400 hover:text-white transition-colors"
          title="Copy FEN"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Action buttons (hidden in inline mode) */}
      {!inlineMode && (
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 px-4 bg-white/5 rounded-xl text-sm text-gray-400 hover:bg-white/10 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-2.5 px-4 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl text-sm text-white font-semibold hover:opacity-90 transition-opacity"
          >
            Apply Position
          </button>
        </div>
      )}
    </div>
  );
}
