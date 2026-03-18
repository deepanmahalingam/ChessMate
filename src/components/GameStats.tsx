import { useGameStore } from '../store/gameStore';
import { classificationColors, classificationLabels } from '../utils/classificationColors';
import type { MoveClassification } from '../types';

export default function GameStats() {
  const { analysis } = useGameStore();
  if (!analysis) return null;

  const whiteMoves = analysis.moves.filter(m => m.color === 'w');
  const blackMoves = analysis.moves.filter(m => m.color === 'b');

  const countByClass = (moves: typeof analysis.moves, cls: MoveClassification) =>
    moves.filter(m => m.classification === cls).length;

  const classOrder: MoveClassification[] = ['brilliant', 'great', 'best', 'good', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder'];

  return (
    <div className="bg-white/5 rounded-xl p-4 border border-white/10">
      <h3 className="text-sm font-semibold text-gray-300 mb-4">Game Statistics</h3>

      {/* Accuracy */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="text-center">
          <div className="text-2xl font-bold text-white">{analysis.whiteAccuracy}%</div>
          <div className="text-xs text-gray-400">White Accuracy</div>
          <div className="mt-2 h-1.5 bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full bg-white rounded-full" style={{ width: `${analysis.whiteAccuracy}%` }} />
          </div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-300">{analysis.blackAccuracy}%</div>
          <div className="text-xs text-gray-400">Black Accuracy</div>
          <div className="mt-2 h-1.5 bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full bg-gray-400 rounded-full" style={{ width: `${analysis.blackAccuracy}%` }} />
          </div>
        </div>
      </div>

      {/* Move Classifications */}
      <div className="space-y-1.5">
        {classOrder.map(cls => {
          const w = countByClass(whiteMoves, cls);
          const b = countByClass(blackMoves, cls);
          if (w === 0 && b === 0) return null;
          return (
            <div key={cls} className="flex items-center text-xs">
              <span
                className="w-2 h-2 rounded-full mr-2 shrink-0"
                style={{ backgroundColor: classificationColors[cls] }}
              />
              <span className="text-gray-400 flex-1">{classificationLabels[cls]}</span>
              <span className="w-6 text-right text-white font-mono">{w}</span>
              <span className="text-gray-600 mx-1">/</span>
              <span className="w-6 text-right text-gray-400 font-mono">{b}</span>
            </div>
          );
        })}
      </div>

      {/* Result */}
      <div className="mt-4 pt-4 border-t border-white/10 text-center">
        <span className="text-xs text-gray-500">Result</span>
        <div className="text-lg font-bold text-white">{analysis.result}</div>
        <div className="text-xs text-gray-400 mt-1">{analysis.opening}</div>
      </div>
    </div>
  );
}
