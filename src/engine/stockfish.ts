import type { MoveClassification } from '../types';

export function classifyMove(evalBefore: number, evalAfter: number, isBestMove: boolean, color: 'w' | 'b'): MoveClassification {
  const sign = color === 'w' ? 1 : -1;
  const diff = (evalAfter - evalBefore) * sign;

  if (isBestMove && diff > 1.5) return 'brilliant';
  if (isBestMove && diff > 0.5) return 'great';
  if (isBestMove) return 'best';
  if (diff > -0.1) return 'good';
  if (diff > -0.3) return 'book';
  if (diff > -0.5) return 'inaccuracy';
  if (diff > -1.0) return 'mistake';
  if (diff > -2.0) return 'miss';
  return 'blunder';
}
