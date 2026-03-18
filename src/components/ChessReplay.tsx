import { useEffect, useRef, useCallback } from 'react';
import { Chessboard } from 'react-chessboard';
import {
  Play, Pause, SkipBack, SkipForward,
  ChevronsLeft, ChevronsRight, Gauge,
} from 'lucide-react';
import { useGameStore } from '../store/gameStore';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export default function ChessReplay() {
  const {
    analysis, currentMoveIndex, isPlaying, playbackSpeed,
    nextMove, prevMove, goToStart, goToEnd, setIsPlaying, setPlaybackSpeed, goToMove,
  } = useGameStore();

  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const currentFen = analysis?.moves[currentMoveIndex]?.fen || START_FEN;
  const currentMove = analysis?.moves[currentMoveIndex];
  const totalMoves = analysis?.moves.length || 0;

  useEffect(() => {
    if (isPlaying) {
      timerRef.current = setInterval(() => {
        const state = useGameStore.getState();
        if (state.analysis && state.currentMoveIndex < state.analysis.moves.length - 1) {
          nextMove();
        } else {
          setIsPlaying(false);
        }
      }, 1000 / playbackSpeed);
    }
    return () => clearInterval(timerRef.current);
  }, [isPlaying, playbackSpeed, nextMove, setIsPlaying]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') nextMove();
    else if (e.key === 'ArrowLeft') prevMove();
    else if (e.key === ' ') { e.preventDefault(); setIsPlaying(!isPlaying); }
    else if (e.key === 'Home') goToStart();
    else if (e.key === 'End') goToEnd();
  }, [nextMove, prevMove, isPlaying, setIsPlaying, goToStart, goToEnd]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const speeds = [0.5, 1, 1.5, 2, 3];

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Board */}
      <div className="chess-board-container w-full max-w-[480px]">
        <Chessboard
          options={{
            position: currentFen,
            animationDurationInMs: 200,
            boardStyle: {
              borderRadius: '8px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            },
            darkSquareStyle: { backgroundColor: '#b58863' },
            lightSquareStyle: { backgroundColor: '#f0d9b5' },
            allowDragging: false,
          }}
        />
      </div>

      {/* Move Info */}
      {currentMove && (
        <div className="text-center">
          <span className="text-sm text-gray-400">
            Move {currentMove.moveNumber}. {currentMove.color === 'w' ? '' : '...'}
            <span className="text-white font-semibold ml-1">{currentMove.san}</span>
          </span>
          <span className="mx-2 text-gray-600">|</span>
          <span className="text-sm text-gray-400">
            Eval: <span className={`font-mono font-semibold ${currentMove.evaluation > 0 ? 'text-green-400' : currentMove.evaluation < 0 ? 'text-red-400' : 'text-gray-300'}`}>
              {currentMove.evaluation > 0 ? '+' : ''}{currentMove.evaluation.toFixed(2)}
            </span>
          </span>
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-2">
        <button onClick={goToStart} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-gray-400 hover:text-white" title="Go to start (Home)">
          <ChevronsLeft className="w-5 h-5" />
        </button>
        <button onClick={prevMove} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-gray-400 hover:text-white" title="Previous move (←)">
          <SkipBack className="w-5 h-5" />
        </button>
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          className="p-3 rounded-xl bg-accent hover:bg-accent-light transition-colors text-white"
          title="Play/Pause (Space)"
        >
          {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
        </button>
        <button onClick={nextMove} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-gray-400 hover:text-white" title="Next move (→)">
          <SkipForward className="w-5 h-5" />
        </button>
        <button onClick={goToEnd} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-gray-400 hover:text-white" title="Go to end (End)">
          <ChevronsRight className="w-5 h-5" />
        </button>
      </div>

      {/* Speed Control */}
      <div className="flex items-center gap-2">
        <Gauge className="w-4 h-4 text-gray-500" />
        {speeds.map(speed => (
          <button
            key={speed}
            onClick={() => setPlaybackSpeed(speed)}
            className={`px-2 py-1 text-xs rounded-md transition-colors ${
              playbackSpeed === speed
                ? 'bg-accent text-white'
                : 'bg-white/5 text-gray-400 hover:text-white'
            }`}
          >
            {speed}x
          </button>
        ))}
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-[480px]">
        <input
          type="range"
          min={-1}
          max={totalMoves - 1}
          value={currentMoveIndex}
          onChange={(e) => goToMove(parseInt(e.target.value))}
          className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-accent"
        />
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>Start</span>
          <span>{currentMoveIndex + 1} / {totalMoves}</span>
          <span>End</span>
        </div>
      </div>
    </div>
  );
}
