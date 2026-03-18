import type { MoveClassification } from '../types';

export const classificationColors: Record<MoveClassification, string> = {
  brilliant: '#1baca6',
  great: '#5c8bb0',
  best: '#96bc4b',
  good: '#95af8a',
  book: '#a88865',
  inaccuracy: '#f7c631',
  mistake: '#e68a2e',
  miss: '#db6b3a',
  blunder: '#ca3431',
};

export const classificationLabels: Record<MoveClassification, string> = {
  brilliant: 'Brilliant',
  great: 'Great Move',
  best: 'Best Move',
  good: 'Good',
  book: 'Book Move',
  inaccuracy: 'Inaccuracy',
  mistake: 'Mistake',
  miss: 'Miss',
  blunder: 'Blunder',
};

export const classificationIcons: Record<MoveClassification, string> = {
  brilliant: '!!',
  great: '!',
  best: '★',
  good: '✓',
  book: '📖',
  inaccuracy: '?!',
  mistake: '?',
  miss: '??',
  blunder: '??',
};
