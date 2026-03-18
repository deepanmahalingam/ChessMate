export type MoveClassification = 'brilliant' | 'great' | 'best' | 'good' | 'book' | 'inaccuracy' | 'mistake' | 'miss' | 'blunder';

export interface AnalyzedMove {
  moveNumber: number;
  san: string;
  uci: string;
  fen: string;
  color: 'w' | 'b';
  evaluation: number;
  bestMove?: string;
  classification: MoveClassification;
  isPawnMove?: boolean;
  isCapture?: boolean;
  isCastle?: boolean;
  isCheck?: boolean;
  isCheckmate?: boolean;
}

export interface GameAnalysis {
  moves: AnalyzedMove[];
  opening: string;
  openingEco?: string;
  result: string;
  whiteAccuracy: number;
  blackAccuracy: number;
  whiteMistakes: number;
  blackMistakes: number;
  whiteBlunders: number;
  blackBlunders: number;
  keyMoments: KeyMoment[];
  summary: GameSummary;
}

export interface KeyMoment {
  moveNumber: number;
  description: string;
  evaluation: number;
  type: 'turning_point' | 'blunder' | 'brilliant' | 'missed_opportunity';
}

export interface GameSummary {
  overview: string;
  opening: string;
  middlegame: string;
  endgame: string;
  criticalMistakes: string[];
  missedOpportunities: string[];
  tacticalThemes: string[];
  strategicThemes: string[];
  whiteStrengths: string[];
  whiteWeaknesses: string[];
  blackStrengths: string[];
  blackWeaknesses: string[];
  beginnerSummary: string;
  advancedSummary: string;
}

export type ProcessingStatus = 'idle' | 'uploading' | 'extracting' | 'analyzing' | 'summarizing' | 'complete' | 'error';

export interface GameState {
  id: string;
  videoFile?: File;
  videoUrl?: string;
  pgn: string;
  fen: string;
  status: ProcessingStatus;
  progress: number;
  error?: string;
  analysis?: GameAnalysis;
  currentMoveIndex: number;
  isPlaying: boolean;
  playbackSpeed: number;
}
