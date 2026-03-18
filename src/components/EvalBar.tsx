import { useGameStore } from '../store/gameStore';

export default function EvalBar() {
  const { analysis, currentMoveIndex } = useGameStore();
  const currentMove = analysis?.moves[currentMoveIndex];
  const evaluation = currentMove?.evaluation ?? 0;

  // Convert eval to percentage (clamped between 5% and 95%)
  const whitePercent = Math.max(5, Math.min(95, 50 + evaluation * 5));

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="w-6 h-[480px] rounded-full overflow-hidden bg-gray-800 border border-gray-700 relative flex flex-col-reverse">
        <div
          className="bg-white transition-all duration-300 rounded-b-full"
          style={{ height: `${whitePercent}%` }}
        />
        <div
          className="bg-gray-900 flex-1 transition-all duration-300 rounded-t-full"
        />
        {/* Center line */}
        <div className="absolute top-1/2 left-0 right-0 h-px bg-gray-600" />
      </div>
      <span className={`text-xs font-mono font-bold ${
        evaluation > 0 ? 'text-white' : evaluation < 0 ? 'text-gray-400' : 'text-gray-500'
      }`}>
        {evaluation > 0 ? '+' : ''}{evaluation.toFixed(1)}
      </span>
    </div>
  );
}
