import { create } from 'zustand';
import type { GameState, ProcessingStatus, GameAnalysis } from '../types';
import { v4 as uuidv4 } from 'uuid';

interface GameStore extends GameState {
  setVideoFile: (file: File) => void;
  setPgn: (pgn: string) => void;
  setStatus: (status: ProcessingStatus) => void;
  setProgress: (progress: number) => void;
  setError: (error: string) => void;
  setAnalysis: (analysis: GameAnalysis) => void;
  setCurrentMoveIndex: (index: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setPlaybackSpeed: (speed: number) => void;
  nextMove: () => void;
  prevMove: () => void;
  goToMove: (index: number) => void;
  goToStart: () => void;
  goToEnd: () => void;
  reset: () => void;
}

const initialState: GameState = {
  id: uuidv4(),
  pgn: '',
  fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  status: 'idle',
  progress: 0,
  currentMoveIndex: -1,
  isPlaying: false,
  playbackSpeed: 1,
};

export const useGameStore = create<GameStore>((set, get) => ({
  ...initialState,

  setVideoFile: (file) => set({ videoFile: file, videoUrl: URL.createObjectURL(file) }),
  setPgn: (pgn) => set({ pgn }),
  setStatus: (status) => set({ status }),
  setProgress: (progress) => set({ progress }),
  setError: (error) => set({ error, status: 'error' }),
  setAnalysis: (analysis) => set({ analysis }),
  setCurrentMoveIndex: (index) => set({ currentMoveIndex: index }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),

  nextMove: () => {
    const { currentMoveIndex, analysis } = get();
    if (analysis && currentMoveIndex < analysis.moves.length - 1) {
      set({ currentMoveIndex: currentMoveIndex + 1 });
    }
  },

  prevMove: () => {
    const { currentMoveIndex } = get();
    if (currentMoveIndex >= 0) {
      set({ currentMoveIndex: currentMoveIndex - 1 });
    }
  },

  goToMove: (index) => set({ currentMoveIndex: index }),

  goToStart: () => set({ currentMoveIndex: -1 }),

  goToEnd: () => {
    const { analysis } = get();
    if (analysis) {
      set({ currentMoveIndex: analysis.moves.length - 1 });
    }
  },

  reset: () => set({ ...initialState, id: uuidv4() }),
}));
