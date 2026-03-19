import { useState, useCallback, useEffect } from 'react';
import { Chess } from 'chess.js';
import {
  RotateCcw, Trash2, Copy, Check, MousePointer2,
} from 'lucide-react';

interface BoardEditorProps {
  initialFen: string;
  onFenChange: (fen: string) => void;
  onClose: () => void;
  inlineMode?: boolean;
}

type PieceType = 'K' | 'Q' | 'R' | 'B' | 'N' | 'P' | 'k' | 'q' | 'r' | 'b' | 'n' | 'p';
type ToolMode = 'place' | 'erase';

const PIECE_SYMBOLS: Record<string, string> = {
  'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙',
  'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟',
};

const PIECE_NAMES: Record<string, string> = {
  'K': 'King', 'Q': 'Queen', 'R': 'Rook', 'B': 'Bishop', 'N': 'Knight', 'P': 'Pawn',
  'k': 'King', 'q': 'Queen', 'r': 'Rook', 'b': 'Bishop', 'n': 'Knight', 'p': 'Pawn',
};

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];

export default function BoardEditor({ initialFen, onFenChange, onClose, inlineMode = false }: BoardEditorProps) {
  const [board, setBoard] = useState<(PieceType | null)[][]>(() => parseFenToBoard(initialFen));
  const [selectedPiece, setSelectedPiece] = useState<PieceType | null>('P'); // Default to white pawn
  const [toolMode, setToolMode] = useState<ToolMode>('place');
  const [copied, setCopied] = useState(false);
  const [sideToMove, setSideToMove] = useState<'w' | 'b'>('w');
  const [lastAction, setLastAction] = useState<string>('Select a piece, then tap squares');

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
    const squareName = `${FILES[col]}${RANKS[row]}`;

    setBoard(prev => {
      const next = prev.map(r => [...r]);
      if (toolMode === 'erase') {
        const removed = next[row][col];
        next[row][col] = null;
        setLastAction(removed ? `Removed ${PIECE_SYMBOLS[removed]} from ${squareName}` : `${squareName} already empty`);
      } else if (selectedPiece) {
        if (next[row][col] === selectedPiece) {
          next[row][col] = null;
          setLastAction(`Removed ${PIECE_SYMBOLS[selectedPiece]} from ${squareName}`);
        } else {
          next[row][col] = selectedPiece;
          const color = selectedPiece === selectedPiece.toUpperCase() ? 'White' : 'Black';
          setLastAction(`Placed ${color} ${PIECE_NAMES[selectedPiece]} ${PIECE_SYMBOLS[selectedPiece]} on ${squareName}`);
        }
      }
      return next;
    });
  }, [selectedPiece, toolMode]);

  const handleSelectPiece = (p: PieceType) => {
    setSelectedPiece(p);
    setToolMode('place');
    const color = p === p.toUpperCase() ? 'White' : 'Black';
    setLastAction(`${color} ${PIECE_NAMES[p]} ${PIECE_SYMBOLS[p]} selected — tap squares to place`);
  };

  const handleReset = () => {
    setBoard(parseFenToBoard('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'));
    setLastAction('Board reset to starting position');
  };

  const handleClear = () => {
    setBoard(Array(8).fill(null).map(() => Array(8).fill(null)));
    setLastAction('Board cleared');
  };

  const handleSave = () => {
    const fen = boardToFen(board);
    try {
      new Chess(fen);
      onFenChange(fen);
      onClose();
    } catch {
      const simpleFen = boardToFen(board).replace(/[KQkq]+/, '-');
      try {
        new Chess(simpleFen);
        onFenChange(simpleFen);
        onClose();
      } catch {
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
      try {
        new Chess(currentFen);
        onFenChange(currentFen);
      } catch {
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
    <div className="bg-gray-900/95 backdrop-blur-sm rounded-2xl border border-white/10 p-4 space-y-3" style={{ touchAction: 'manipulation' }}>
      <div className="text-center">
        <h3 className="text-lg font-bold text-white">Board Editor</h3>
        <p className="text-xs text-gray-400 mt-0.5">Select a piece, then tap squares to place it</p>
      </div>

      {/* Current action status bar — always visible */}
      <div className={`text-center py-2 px-3 rounded-lg text-sm font-medium ${
        toolMode === 'erase'
          ? 'bg-red-500/15 text-red-300 border border-red-500/30'
          : selectedPiece
            ? 'bg-purple-500/15 text-purple-300 border border-purple-500/30'
            : 'bg-white/5 text-gray-400 border border-white/10'
      }`}>
        {toolMode === 'erase' ? (
          <span className="flex items-center justify-center gap-2">
            <Trash2 className="w-4 h-4" /> Erase mode — tap squares to remove pieces
          </span>
        ) : selectedPiece ? (
          <span className="flex items-center justify-center gap-2">
            <MousePointer2 className="w-4 h-4" />
            Placing: <span className="text-2xl leading-none">{PIECE_SYMBOLS[selectedPiece]}</span>
            {selectedPiece === selectedPiece.toUpperCase() ? 'White' : 'Black'} {PIECE_NAMES[selectedPiece]}
          </span>
        ) : (
          'Select a piece below to start editing'
        )}
      </div>

      {/* Piece palette — larger buttons */}
      <div className="space-y-2">
        <div className="flex items-center justify-center gap-1.5">
          <span className="text-xs text-gray-500 w-12 text-right mr-1">White:</span>
          {(['K', 'Q', 'R', 'B', 'N', 'P'] as PieceType[]).map(p => (
            <button
              key={p}
              onClick={() => handleSelectPiece(p)}
              className={`w-10 h-10 sm:w-11 sm:h-11 rounded-lg text-2xl flex items-center justify-center transition-all ${
                selectedPiece === p && toolMode === 'place'
                  ? 'bg-purple-500/30 border-2 border-purple-400 scale-110 shadow-lg shadow-purple-500/20'
                  : 'bg-white/5 border border-white/10 hover:bg-white/15 active:bg-white/20'
              }`}
              style={{ touchAction: 'manipulation' }}
              title={`White ${PIECE_NAMES[p]}`}
            >
              {PIECE_SYMBOLS[p]}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-center gap-1.5">
          <span className="text-xs text-gray-500 w-12 text-right mr-1">Black:</span>
          {(['k', 'q', 'r', 'b', 'n', 'p'] as PieceType[]).map(p => (
            <button
              key={p}
              onClick={() => handleSelectPiece(p)}
              className={`w-10 h-10 sm:w-11 sm:h-11 rounded-lg text-2xl flex items-center justify-center transition-all ${
                selectedPiece === p && toolMode === 'place'
                  ? 'bg-purple-500/30 border-2 border-purple-400 scale-110 shadow-lg shadow-purple-500/20'
                  : 'bg-white/5 border border-white/10 hover:bg-white/15 active:bg-white/20'
              }`}
              style={{ touchAction: 'manipulation' }}
              title={`Black ${PIECE_NAMES[p]}`}
            >
              {PIECE_SYMBOLS[p]}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-center gap-2 pt-1">
          <button
            onClick={() => { setToolMode('erase'); setSelectedPiece(null); setLastAction('Erase mode — tap squares to remove'); }}
            className={`px-4 py-2 rounded-lg text-xs flex items-center gap-1.5 transition-all ${
              toolMode === 'erase'
                ? 'bg-red-500/20 border-2 border-red-400 text-red-400'
                : 'bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10 active:bg-white/15'
            }`}
            style={{ touchAction: 'manipulation' }}
          >
            <Trash2 className="w-3.5 h-3.5" /> Erase
          </button>
          <button
            onClick={handleReset}
            className="px-4 py-2 rounded-lg text-xs flex items-center gap-1.5 bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10 active:bg-white/15"
            style={{ touchAction: 'manipulation' }}
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </button>
          <button
            onClick={handleClear}
            className="px-4 py-2 rounded-lg text-xs flex items-center gap-1.5 bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10 active:bg-white/15"
            style={{ touchAction: 'manipulation' }}
          >
            <Trash2 className="w-3.5 h-3.5" /> Clear
          </button>
        </div>
      </div>

      {/* Interactive board — responsive sizing */}
      <div className="flex justify-center">
        <div className="inline-block">
          {/* Column labels */}
          <div className="flex ml-7">
            {FILES.map(f => (
              <div key={f} className="w-[clamp(36px,10vw,48px)] h-4 flex items-center justify-center text-[10px] text-gray-500 font-mono">
                {f}
              </div>
            ))}
          </div>
          <div className="flex">
            {/* Row labels */}
            <div className="flex flex-col">
              {RANKS.map(r => (
                <div key={r} className="w-7 flex items-center justify-center text-[10px] text-gray-500 font-mono" style={{ height: 'clamp(36px, 10vw, 48px)' }}>
                  {r}
                </div>
              ))}
            </div>
            {/* Board grid */}
            <div className="border-2 border-gray-600 rounded-lg overflow-hidden shadow-lg">
              {board.map((row, r) => (
                <div key={r} className="flex">
                  {row.map((piece, c) => {
                    const isLight = (r + c) % 2 === 0;
                    return (
                      <button
                        key={`${r}-${c}`}
                        onClick={() => handleSquareClick(r, c)}
                        onTouchEnd={(e) => {
                          e.preventDefault();
                          handleSquareClick(r, c);
                        }}
                        className={`flex items-center justify-center text-2xl sm:text-3xl transition-colors select-none
                          ${isLight ? 'bg-[#f0d9b5]' : 'bg-[#b58863]'}
                          ${isLight ? 'hover:bg-[#e8d0a5] active:bg-[#dfc595]' : 'hover:bg-[#a67d58] active:bg-[#9a724f]'}
                        `}
                        style={{
                          width: 'clamp(36px, 10vw, 48px)',
                          height: 'clamp(36px, 10vw, 48px)',
                          touchAction: 'manipulation',
                          WebkitTapHighlightColor: 'transparent',
                          cursor: toolMode === 'erase' ? 'crosshair' : 'pointer',
                        }}
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

      {/* Last action feedback */}
      <p className="text-center text-xs text-gray-500 min-h-[1.25rem]">{lastAction}</p>

      {/* Side to move */}
      <div className="flex items-center justify-center gap-3">
        <span className="text-xs text-gray-400">Side to move:</span>
        <button
          onClick={() => setSideToMove('w')}
          className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
            sideToMove === 'w'
              ? 'bg-white/20 text-white border border-white/30'
              : 'bg-white/5 text-gray-400 border border-white/10'
          }`}
          style={{ touchAction: 'manipulation' }}
        >
          White
        </button>
        <button
          onClick={() => setSideToMove('b')}
          className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
            sideToMove === 'b'
              ? 'bg-gray-600 text-white border border-gray-500'
              : 'bg-white/5 text-gray-400 border border-white/10'
          }`}
          style={{ touchAction: 'manipulation' }}
        >
          Black
        </button>
      </div>

      {/* FEN display */}
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-black/30 rounded-lg px-3 py-2 font-mono text-[10px] text-gray-300 truncate border border-white/5">
          {currentFen}
        </div>
        <button
          onClick={handleCopyFen}
          className="shrink-0 p-2 bg-white/5 rounded-lg text-gray-400 hover:text-white transition-colors border border-white/10"
          title="Copy FEN"
          style={{ touchAction: 'manipulation' }}
        >
          {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
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
