import { useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { useGameStore } from '../store/gameStore';
import { classificationColors } from '../utils/classificationColors';

export default function EvalGraph() {
  const { analysis, currentMoveIndex, goToMove } = useGameStore();

  const data = useMemo(() => {
    if (!analysis) return [];
    return analysis.moves.map((move, i) => ({
      index: i,
      moveLabel: `${move.moveNumber}${move.color === 'w' ? '.' : '...'} ${move.san}`,
      eval: Math.max(-5, Math.min(5, move.evaluation)),
      rawEval: move.evaluation,
      color: classificationColors[move.classification],
      classification: move.classification,
    }));
  }, [analysis]);

  if (!analysis) return null;

  return (
    <div className="bg-white/5 rounded-xl p-4 border border-white/10">
      <h3 className="text-sm font-semibold text-gray-300 mb-3">Evaluation Graph</h3>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            onClick={(e) => {
              if (e?.activeTooltipIndex != null && typeof e.activeTooltipIndex === 'number') {
                goToMove(e.activeTooltipIndex);
              }
            }}
          >
            <defs>
              <linearGradient id="whiteGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ffffff" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="blackGrad" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="#374151" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#374151" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="index" hide />
            <YAxis domain={[-5, 5]} hide />
            <ReferenceLine y={0} stroke="#4b5563" strokeDasharray="3 3" />
            {currentMoveIndex >= 0 && (
              <ReferenceLine x={currentMoveIndex} stroke="#e43f5a" strokeWidth={2} />
            )}
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload?.[0]) {
                  const d = payload[0].payload;
                  return (
                    <div className="bg-gray-800 border border-gray-600 rounded-lg p-2 text-xs">
                      <div className="text-white font-semibold">{d.moveLabel}</div>
                      <div className="text-gray-400">
                        Eval: <span className={d.rawEval > 0 ? 'text-green-400' : 'text-red-400'}>
                          {d.rawEval > 0 ? '+' : ''}{d.rawEval.toFixed(2)}
                        </span>
                      </div>
                      <div style={{ color: d.color }} className="capitalize">{d.classification}</div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Area
              type="monotone"
              dataKey="eval"
              stroke="#9ca3af"
              strokeWidth={1.5}
              fill="url(#whiteGrad)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
