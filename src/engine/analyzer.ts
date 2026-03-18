import { Chess } from 'chess.js';
import type { AnalyzedMove, GameAnalysis, KeyMoment, GameSummary, MoveClassification } from '../types';
import { classifyMove } from './stockfish';

interface EvalResult {
  score: number;
  bestMove: string;
}

const OPENINGS: Record<string, string> = {
  'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR': "King's Pawn Opening",
  'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR': "Queen's Pawn Opening",
  'rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR': 'French Defense',
  'rnbqkbnr/pp1ppppp/2p5/8/4P3/8/PPPP1PPP/RNBQKBNR': 'Caro-Kann Defense',
  'rnbqkbnr/pppppp1p/6p1/8/4P3/8/PPPP1PPP/RNBQKBNR': 'Modern Defense',
  'rnbqkbnr/pppppppp/8/8/2P5/8/PP1PPPPP/RNBQKBNR': 'English Opening',
  'rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R': 'Reti Opening',
  'rnbqkb1r/pppppppp/5n2/8/4P3/8/PPPP1PPP/RNBQKBNR': "Alekhine's Defense",
  'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR': "King's Pawn Game",
  'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R': "King's Knight Opening",
  'r1bqkbnr/pppppppp/2n5/8/4P3/8/PPPP1PPP/RNBQKBNR': 'Nimzowitsch Defense',
  'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR': 'Sicilian Defense',
  'rnbqkbnr/pppp1ppp/8/4p3/2B1P3/8/PPPP1PPP/RNBQK1NR': "Bishop's Opening",
  'rnbqkb1r/pppppppp/5n2/8/3P4/8/PPP1PPPP/RNBQKBNR': 'Indian Defense',
  'rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR': "Queen's Pawn Game",
};

function identifyOpening(chess: Chess): string {
  const history = chess.history();

  for (let i = Math.min(history.length, 6) - 1; i >= 0; i--) {
    const tc = new Chess();
    for (let j = 0; j <= i; j++) {
      tc.move(history[j]);
    }
    const fen = tc.fen().split(' ').slice(0, 1).join(' ');
    for (const [key, name] of Object.entries(OPENINGS)) {
      if (key.startsWith(fen) || fen.startsWith(key.split(' ')[0])) {
        return name;
      }
    }
  }

  if (history.length > 0) {
    const firstMove = history[0];
    if (firstMove === 'e4') return "King's Pawn Opening";
    if (firstMove === 'd4') return "Queen's Pawn Opening";
    if (firstMove === 'c4') return 'English Opening';
    if (firstMove === 'Nf3') return 'Reti Opening';
  }

  return 'Unknown Opening';
}

export async function analyzeGame(
  pgn: string,
  onProgress: (progress: number) => void,
  evaluatePosition: (fen: string) => Promise<EvalResult>
): Promise<GameAnalysis> {
  const chess = new Chess();
  chess.loadPgn(pgn);
  const moves = chess.history({ verbose: true });
  const opening = identifyOpening(chess);

  const analyzedMoves: AnalyzedMove[] = [];
  const keyMoments: KeyMoment[] = [];

  const replayChess = new Chess();
  let prevEval = 0;

  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    replayChess.move(move.san);

    const evalResult = await evaluatePosition(replayChess.fen());
    const isBestMove = move.lan === evalResult.bestMove || move.san === evalResult.bestMove;
    const classification = classifyMove(prevEval, evalResult.score, isBestMove, move.color);

    const analyzedMove: AnalyzedMove = {
      moveNumber: Math.floor(i / 2) + 1,
      san: move.san,
      uci: move.lan,
      fen: replayChess.fen(),
      color: move.color,
      evaluation: evalResult.score,
      bestMove: evalResult.bestMove,
      classification,
      isCapture: !!move.captured,
      isCastle: move.san === 'O-O' || move.san === 'O-O-O',
      isCheck: move.san.includes('+'),
      isCheckmate: move.san.includes('#'),
    };

    analyzedMoves.push(analyzedMove);

    if (classification === 'blunder' || classification === 'brilliant') {
      keyMoments.push({
        moveNumber: analyzedMove.moveNumber,
        description: classification === 'blunder'
          ? `${move.color === 'w' ? 'White' : 'Black'} blundered with ${move.san}`
          : `${move.color === 'w' ? 'White' : 'Black'} played a brilliant ${move.san}`,
        evaluation: evalResult.score,
        type: classification === 'blunder' ? 'blunder' : 'brilliant',
      });
    }

    const sign = move.color === 'w' ? 1 : -1;
    const diff = (evalResult.score - prevEval) * sign;
    if (Math.abs(diff) > 1.5 && i > 4) {
      const existing = keyMoments.find(k => k.moveNumber === analyzedMove.moveNumber);
      if (!existing) {
        keyMoments.push({
          moveNumber: analyzedMove.moveNumber,
          description: `Turning point: evaluation shifted by ${diff.toFixed(1)} after ${move.san}`,
          evaluation: evalResult.score,
          type: 'turning_point',
        });
      }
    }

    prevEval = evalResult.score;
    onProgress(((i + 1) / moves.length) * 100);
  }

  const whiteMovesAnalyzed = analyzedMoves.filter(m => m.color === 'w');
  const blackMovesAnalyzed = analyzedMoves.filter(m => m.color === 'b');

  const countClass = (moves: AnalyzedMove[], cls: MoveClassification[]) =>
    moves.filter(m => cls.includes(m.classification)).length;

  const accuracy = (moves: AnalyzedMove[]) => {
    if (moves.length === 0) return 0;
    const good = countClass(moves, ['brilliant', 'great', 'best', 'good', 'book']);
    return Math.round((good / moves.length) * 100);
  };

  const summary = generateSummary(analyzedMoves, opening, keyMoments);

  return {
    moves: analyzedMoves,
    opening,
    result: chess.isCheckmate() ? (chess.turn() === 'w' ? '0-1' : '1-0') : chess.isDraw() ? '1/2-1/2' : '*',
    whiteAccuracy: accuracy(whiteMovesAnalyzed),
    blackAccuracy: accuracy(blackMovesAnalyzed),
    whiteMistakes: countClass(whiteMovesAnalyzed, ['mistake', 'miss']),
    blackMistakes: countClass(blackMovesAnalyzed, ['mistake', 'miss']),
    whiteBlunders: countClass(whiteMovesAnalyzed, ['blunder']),
    blackBlunders: countClass(blackMovesAnalyzed, ['blunder']),
    keyMoments,
    summary,
  };
}

function generateSummary(moves: AnalyzedMove[], opening: string, keyMoments: KeyMoment[]): GameSummary {
  const totalMoves = moves.length;
  const openingMoves = moves.slice(0, Math.min(10, Math.floor(totalMoves * 0.2)));
  const middleMoves = moves.slice(openingMoves.length, Math.floor(totalMoves * 0.7));
  const endMoves = moves.slice(Math.floor(totalMoves * 0.7));

  const whiteMoves = moves.filter(m => m.color === 'w');
  const blackMoves = moves.filter(m => m.color === 'b');

  const countGood = (m: AnalyzedMove[]) => m.filter(x => ['brilliant', 'great', 'best', 'good'].includes(x.classification)).length;
  const countBad = (m: AnalyzedMove[]) => m.filter(x => ['blunder', 'mistake', 'miss'].includes(x.classification)).length;

  const lastEval = moves[moves.length - 1]?.evaluation ?? 0;
  const winner = lastEval > 1 ? 'White' : lastEval < -1 ? 'Black' : 'Neither player';

  const tacticalThemes: string[] = [];
  if (moves.some(m => m.isCapture && m.classification === 'brilliant')) tacticalThemes.push('Tactical exchanges');
  if (moves.some(m => m.isCheck)) tacticalThemes.push('Check-based tactics');
  if (moves.some(m => m.isCastle)) tacticalThemes.push('King safety (castling)');
  if (moves.filter(m => m.isCapture).length > totalMoves * 0.3) tacticalThemes.push('Heavy material exchanges');
  if (tacticalThemes.length === 0) tacticalThemes.push('Positional play');

  const strategicThemes: string[] = [];
  if (opening.includes('Sicilian') || opening.includes('King')) strategicThemes.push('Open game dynamics');
  if (opening.includes('Queen') || opening.includes('Indian')) strategicThemes.push('Closed/semi-closed structures');
  if (middleMoves.some(m => m.isPawnMove)) strategicThemes.push('Pawn structure management');
  if (strategicThemes.length === 0) strategicThemes.push('Classical development');

  return {
    overview: `A ${totalMoves}-move game featuring the ${opening}. ${winner} demonstrated stronger play overall. The game featured ${keyMoments.length} key moments and ${moves.filter(m => m.classification === 'brilliant').length} brilliant moves.`,
    opening: `The game began with the ${opening}. ${openingMoves.length > 0 ? `Both players developed normally through the first ${openingMoves.length} half-moves.` : 'The opening phase was brief.'}`,
    middlegame: middleMoves.length > 0
      ? `The middlegame saw ${middleMoves.filter(m => m.isCapture).length} captures and ${middleMoves.filter(m => m.isCheck).length} checks. White played ${countGood(middleMoves.filter(m => m.color === 'w'))} accurate moves while Black played ${countGood(middleMoves.filter(m => m.color === 'b'))} accurate moves in this phase.`
      : 'The game ended before a substantial middlegame developed.',
    endgame: endMoves.length > 3
      ? `The endgame phase spanned ${endMoves.length} half-moves. ${lastEval > 2 ? 'White converted the advantage successfully.' : lastEval < -2 ? 'Black converted the advantage successfully.' : 'The endgame was closely contested.'}`
      : 'The game concluded without a prolonged endgame.',
    criticalMistakes: keyMoments.filter(k => k.type === 'blunder').map(k => k.description),
    missedOpportunities: keyMoments.filter(k => k.type === 'missed_opportunity').map(k => k.description),
    tacticalThemes,
    strategicThemes,
    whiteStrengths: [
      countGood(whiteMoves) > whiteMoves.length * 0.6 ? 'Consistent accurate play' : 'Occasional tactical awareness',
      whiteMoves.some(m => m.classification === 'brilliant') ? 'Found brilliant moves' : 'Solid positional understanding',
    ],
    whiteWeaknesses: [
      countBad(whiteMoves) > 3 ? 'Too many inaccuracies' : 'Minor imprecisions',
      whiteMoves.some(m => m.classification === 'blunder') ? 'Critical blunders' : 'Could improve consistency',
    ],
    blackStrengths: [
      countGood(blackMoves) > blackMoves.length * 0.6 ? 'Consistent accurate play' : 'Occasional tactical awareness',
      blackMoves.some(m => m.classification === 'brilliant') ? 'Found brilliant moves' : 'Solid positional understanding',
    ],
    blackWeaknesses: [
      countBad(blackMoves) > 3 ? 'Too many inaccuracies' : 'Minor imprecisions',
      blackMoves.some(m => m.classification === 'blunder') ? 'Critical blunders' : 'Could improve consistency',
    ],
    beginnerSummary: `This was a ${totalMoves > 60 ? 'long' : totalMoves > 30 ? 'medium-length' : 'short'} game using the ${opening}. ${winner === 'Neither player' ? 'The game was evenly matched.' : `${winner} played better overall.`} Key takeaway: ${countBad(moves) > 5 ? 'Both players should focus on reducing mistakes and calculating more carefully.' : 'The game was well-played with few major errors.'}`,
    advancedSummary: `${opening} led to a ${strategicThemes[0]?.toLowerCase() || 'standard'} position. The evaluation swung ${keyMoments.filter(k => k.type === 'turning_point').length} times at key junctures. White's accuracy was ${Math.round((countGood(whiteMoves) / Math.max(whiteMoves.length, 1)) * 100)}% while Black achieved ${Math.round((countGood(blackMoves) / Math.max(blackMoves.length, 1)) * 100)}%. ${tacticalThemes.join(', ')} were the primary themes. ${keyMoments.length > 0 ? `The most critical moment came at move ${keyMoments[0].moveNumber}.` : 'The game progressed without major swings.'}`,
  };
}
