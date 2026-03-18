import { useRef, useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { classificationColors, classificationIcons } from '../utils/classificationColors';

export default function MoveList() {
  const { analysis, currentMoveIndex, goToMove } = useGameStore();
  const listRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentMoveIndex]);

  if (!analysis) return null;

  // Group moves into pairs (white + black)
  const movePairs: Array<{ number: number; white?: typeof analysis.moves[0]; black?: typeof analysis.moves[0]; whiteIdx: number; blackIdx: number }> = [];

  for (let i = 0; i < analysis.moves.length; i += 2) {
    movePairs.push({
      number: analysis.moves[i].moveNumber,
      white: analysis.moves[i],
      black: analysis.moves[i + 1],
      whiteIdx: i,
      blackIdx: i + 1,
    });
  }

  return (
    <div className="bg-white/5 rounded-xl border border-white/10 flex flex-col max-h-[480px]">
      <div className="p-3 border-b border-white/10">
        <h3 className="text-sm font-semibold text-gray-300">Moves</h3>
        {analysis.opening && (
          <p className="text-xs text-gray-500 mt-0.5">{analysis.opening}</p>
        )}
      </div>
      <div ref={listRef} className="overflow-y-auto flex-1 p-2">
        {movePairs.map((pair) => (
          <div key={pair.number} className="flex items-stretch text-sm">
            <span className="w-8 text-xs text-gray-500 flex items-center justify-center shrink-0">
              {pair.number}.
            </span>
            {pair.white && (
              <button
                ref={currentMoveIndex === pair.whiteIdx ? activeRef : undefined}
                onClick={() => goToMove(pair.whiteIdx)}
                className={`flex-1 px-2 py-1 rounded text-left flex items-center gap-1 transition-colors ${
                  currentMoveIndex === pair.whiteIdx
                    ? 'bg-accent/20 text-white'
                    : 'hover:bg-white/5 text-gray-300'
                }`}
              >
                <span className="font-mono">{pair.white.san}</span>
                <span
                  className="text-[10px] ml-auto opacity-70"
                  style={{ color: classificationColors[pair.white.classification] }}
                >
                  {classificationIcons[pair.white.classification]}
                </span>
              </button>
            )}
            {pair.black && (
              <button
                ref={currentMoveIndex === pair.blackIdx ? activeRef : undefined}
                onClick={() => goToMove(pair.blackIdx)}
                className={`flex-1 px-2 py-1 rounded text-left flex items-center gap-1 transition-colors ${
                  currentMoveIndex === pair.blackIdx
                    ? 'bg-accent/20 text-white'
                    : 'hover:bg-white/5 text-gray-300'
                }`}
              >
                <span className="font-mono">{pair.black.san}</span>
                <span
                  className="text-[10px] ml-auto opacity-70"
                  style={{ color: classificationColors[pair.black.classification] }}
                >
                  {classificationIcons[pair.black.classification]}
                </span>
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
