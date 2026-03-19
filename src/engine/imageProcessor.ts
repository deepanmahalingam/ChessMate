/**
 * Chess Position Recognition from Images (v3)
 *
 * Practical approach for browser-based chess board detection:
 *   1. Detect if a chessboard is present in the image (reliable)
 *   2. Detect which squares are occupied vs empty (somewhat reliable)
 *   3. Match occupancy pattern against known opening positions
 *   4. Default to starting position when uncertain
 *   5. Present the Board Editor as the primary correction tool
 *
 * Piece TYPE identification from photos requires ML/CNN and is not
 * possible with pixel analysis alone. This implementation focuses on
 * what IS reliable and provides great editing tools for the rest.
 */

export interface DetectedPosition {
  fen: string;
  confidence: number;
  boardFound: boolean;
  imageUrl: string;
  fileName: string;
  index: number;
  matchedPositionName?: string;
}

export interface ImageProcessingResult {
  positions: DetectedPosition[];
  reconstructedPgn: string;
  moveCount: number;
  isDemoMode: boolean;
}

// ─── Board Detection ─────────────────────────────────────────────

interface BoardRegion {
  x: number;
  y: number;
  size: number;
}

/**
 * Detect if a chessboard is present in the image.
 * Uses alternating brightness pattern detection across multiple scales/positions.
 */
function detectBoardRegion(
  ctx: CanvasRenderingContext2D,
  imgWidth: number,
  imgHeight: number
): BoardRegion | null {
  const fullData = ctx.getImageData(0, 0, imgWidth, imgHeight);
  const data = fullData.data;

  let bestRegion: BoardRegion | null = null;
  let bestScore = 0;

  const minDim = Math.min(imgWidth, imgHeight);
  // Try multiple scales and positions
  const scales = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4];

  for (const scale of scales) {
    const boardSize = Math.floor(minDim * scale);
    const step = Math.max(Math.floor(boardSize * 0.08), 10);

    for (let y = 0; y <= imgHeight - boardSize; y += step) {
      for (let x = 0; x <= imgWidth - boardSize; x += step) {
        const score = scoreChessPattern(data, imgWidth, fullData.height, x, y, boardSize);
        if (score > bestScore && score > 0.5) {
          bestScore = score;
          bestRegion = { x, y, size: boardSize };
        }
      }
    }
    // Early exit if we found a great match
    if (bestScore > 0.75) break;
  }

  return bestRegion;
}

/**
 * Score how well a region matches a chessboard alternating pattern.
 * Samples the EDGES of each square (not center, to avoid pieces).
 */
function scoreChessPattern(
  data: Uint8ClampedArray,
  imgWidth: number,
  imgHeight: number,
  regionX: number,
  regionY: number,
  boardSize: number
): number {
  const sqSize = boardSize / 8;

  // Sample brightness at corners of squares (less affected by pieces)
  const cornerBrightness: number[][] = [];
  for (let row = 0; row < 8; row++) {
    cornerBrightness[row] = [];
    for (let col = 0; col < 8; col++) {
      // Sample 4 corners of the square, use the brightest (most likely to be bare square)
      const offsets = [
        [0.08, 0.08], [0.92, 0.08], [0.08, 0.92], [0.92, 0.92],
      ];
      const values: number[] = [];
      for (const [fx, fy] of offsets) {
        const px = Math.floor(regionX + col * sqSize + sqSize * fx);
        const py = Math.floor(regionY + row * sqSize + sqSize * fy);
        if (px >= 0 && px < imgWidth && py >= 0 && py < imgHeight) {
          const idx = (py * imgWidth + px) * 4;
          values.push((data[idx] + data[idx + 1] + data[idx + 2]) / 3);
        }
      }
      // Use median corner value as the square's "true" color
      if (values.length > 0) {
        values.sort((a, b) => a - b);
        cornerBrightness[row][col] = values[Math.floor(values.length / 2)];
      } else {
        cornerBrightness[row][col] = -1;
      }
    }
  }

  // Try both pattern orientations
  let bestScore = 0;
  for (const flip of [false, true]) {
    let lightVals: number[] = [];
    let darkVals: number[] = [];

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (cornerBrightness[r][c] < 0) continue;
        const isLight = flip ? (r + c) % 2 === 1 : (r + c) % 2 === 0;
        if (isLight) lightVals.push(cornerBrightness[r][c]);
        else darkVals.push(cornerBrightness[r][c]);
      }
    }

    if (lightVals.length < 10 || darkVals.length < 10) continue;

    const avgLight = lightVals.reduce((a, b) => a + b, 0) / lightVals.length;
    const avgDark = darkVals.reduce((a, b) => a + b, 0) / darkVals.length;
    const contrast = avgLight - avgDark;

    if (contrast < 20) continue;

    // Score: how well do squares match their expected category?
    const threshold = (avgLight + avgDark) / 2;
    let correct = 0;
    let total = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (cornerBrightness[r][c] < 0) continue;
        const isLight = flip ? (r + c) % 2 === 1 : (r + c) % 2 === 0;
        const measured = cornerBrightness[r][c] > threshold;
        if (measured === isLight) correct++;
        total++;
      }
    }

    const score = total > 0 ? correct / total : 0;
    const contrastBonus = Math.min(contrast / 150, 0.1);
    if (score + contrastBonus > bestScore) {
      bestScore = score + contrastBonus;
    }
  }

  return bestScore;
}

// ─── Occupancy Detection ─────────────────────────────────────────

/**
 * Detect which squares are occupied (have a piece) vs empty.
 * This is more reliable than piece type identification.
 *
 * Strategy: Compare each square's center brightness/variance
 * against the expected bare square color.
 */
function detectOccupancy(
  ctx: CanvasRenderingContext2D,
  imgWidth: number,
  imgHeight: number,
  board: BoardRegion
): boolean[][] {
  const data = ctx.getImageData(0, 0, imgWidth, imgHeight).data;
  const sqSize = board.size / 8;

  // Step 1: Establish baseline colors for empty light and dark squares
  // Use corner samples from ALL squares and find the two cluster centers
  const allCornerSamples: { brightness: number; isEvenParity: boolean }[] = [];

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const corners = [[0.05, 0.05], [0.95, 0.05], [0.05, 0.95], [0.95, 0.95]];
      for (const [fx, fy] of corners) {
        const px = Math.floor(board.x + col * sqSize + sqSize * fx);
        const py = Math.floor(board.y + row * sqSize + sqSize * fy);
        if (px >= 0 && px < imgWidth && py >= 0 && py < imgHeight) {
          const idx = (py * imgWidth + px) * 4;
          const b = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
          allCornerSamples.push({ brightness: b, isEvenParity: (row + col) % 2 === 0 });
        }
      }
    }
  }

  // Separate into even-parity and odd-parity squares
  const evenBrightness = allCornerSamples.filter(s => s.isEvenParity).map(s => s.brightness);
  const oddBrightness = allCornerSamples.filter(s => !s.isEvenParity).map(s => s.brightness);

  evenBrightness.sort((a, b) => a - b);
  oddBrightness.sort((a, b) => a - b);

  // Use upper quartile (most likely to be bare square, not covered by piece)
  const evenBaseline = evenBrightness.length > 0
    ? evenBrightness[Math.floor(evenBrightness.length * 0.75)] : 180;
  const oddBaseline = oddBrightness.length > 0
    ? oddBrightness[Math.floor(oddBrightness.length * 0.75)] : 100;

  // Determine which parity is light vs dark
  const evenIsLight = evenBaseline > oddBaseline;

  // Step 2: For each square, compare center region to expected baseline
  const occupied: boolean[][] = [];

  for (let row = 0; row < 8; row++) {
    occupied[row] = [];
    for (let col = 0; col < 8; col++) {
      const isEven = (row + col) % 2 === 0;
      const expectedBg = isEven
        ? (evenIsLight ? evenBaseline : oddBaseline)
        : (evenIsLight ? oddBaseline : evenBaseline);

      // Sample center of square
      const cx = Math.floor(board.x + col * sqSize + sqSize * 0.3);
      const cy = Math.floor(board.y + row * sqSize + sqSize * 0.2);
      const cw = Math.floor(sqSize * 0.4);
      const ch = Math.floor(sqSize * 0.5);

      let centerSum = 0;
      let centerSumSq = 0;
      let centerCount = 0;

      for (let y = cy; y < cy + ch && y < imgHeight; y++) {
        for (let x = cx; x < cx + cw && x < imgWidth; x++) {
          if (x < 0 || y < 0) continue;
          const idx = (y * imgWidth + x) * 4;
          const b = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
          centerSum += b;
          centerSumSq += b * b;
          centerCount++;
        }
      }

      if (centerCount === 0) {
        occupied[row][col] = false;
        continue;
      }

      const centerMean = centerSum / centerCount;
      const centerVariance = centerSumSq / centerCount - centerMean * centerMean;

      // A piece is present if:
      // - Center brightness differs significantly from expected background
      // - Center has high variance (3D piece creates shadows + highlights)
      const brightnessDiff = Math.abs(centerMean - expectedBg);
      const hasHighVariance = centerVariance > 300;
      const hasBrightnessDiff = brightnessDiff > 25;

      occupied[row][col] = hasHighVariance || hasBrightnessDiff;
    }
  }

  return occupied;
}

// ─── Position Matching ───────────────────────────────────────────

interface KnownPosition {
  name: string;
  fen: string;
  // Occupancy as 8 rows of 8 booleans (true = piece present)
  // Row 0 = rank 8 (top of board from white's perspective)
  occupancy: string; // '1' = occupied, '0' = empty, '/' = row separator
}

const KNOWN_POSITIONS: KnownPosition[] = [
  {
    name: 'Starting Position',
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    occupancy: '11111111/11111111/00000000/00000000/00000000/00000000/11111111/11111111',
  },
  {
    name: 'After 1.e4',
    fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    occupancy: '11111111/11111111/00000000/00000000/00001000/00000000/11110111/11111111',
  },
  {
    name: 'After 1.d4',
    fen: 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1',
    occupancy: '11111111/11111111/00000000/00000000/00010000/00000000/11101111/11111111',
  },
  {
    name: 'After 1.e4 e5',
    fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
    occupancy: '11111111/11110111/00000000/00001000/00001000/00000000/11110111/11111111',
  },
  {
    name: 'After 1.d4 d5',
    fen: 'rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 0 2',
    occupancy: '11111111/11101111/00000000/00010000/00010000/00000000/11101111/11111111',
  },
  {
    name: 'After 1.e4 e5 2.Nf3 Nc6',
    fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
    occupancy: '10111111/11110111/00100000/00001000/00001000/00000100/11110111/11111011',
  },
  {
    name: 'Italian Game (3.Bc4)',
    fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3',
    occupancy: '10111111/11110111/00100000/00001000/00101000/00000100/11110111/11111001',
  },
  {
    name: 'Sicilian Defense',
    fen: 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
    occupancy: '11111111/11011111/00000000/00100000/00001000/00000000/11110111/11111111',
  },
  {
    name: 'French Defense',
    fen: 'rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
    occupancy: '11111111/11110111/00001000/00000000/00001000/00000000/11110111/11111111',
  },
  {
    name: "Queen's Gambit",
    fen: 'rnbqkbnr/ppp1pppp/8/3p4/2PP4/8/PP2PPPP/RNBQKBNR b KQkq - 0 2',
    occupancy: '11111111/11101111/00000000/00010000/00110000/00000000/11001111/11111111',
  },
];

/**
 * Match detected occupancy against known positions.
 * Also tries the flipped board (for when camera is on Black's side).
 */
function matchOccupancyToPosition(
  occupied: boolean[][]
): { fen: string; name: string; confidence: number } {
  // Convert to string for comparison
  const toPattern = (occ: boolean[][]): string =>
    occ.map(row => row.map(b => b ? '1' : '0').join('')).join('/');

  // Also create a flipped version (rotate 180°)
  const flipped: boolean[][] = [];
  for (let r = 0; r < 8; r++) {
    flipped[r] = [];
    for (let c = 0; c < 8; c++) {
      flipped[r][c] = occupied[7 - r][7 - c];
    }
  }

  const normalPattern = toPattern(occupied);
  const flippedPattern = toPattern(flipped);

  let bestMatch = {
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    name: 'Starting Position',
    confidence: 0,
  };
  let bestScore = 0;

  for (const known of KNOWN_POSITIONS) {
    // Compare against normal orientation
    const normalScore = comparePatterns(normalPattern, known.occupancy);
    if (normalScore > bestScore) {
      bestScore = normalScore;
      bestMatch = { fen: known.fen, name: known.name, confidence: normalScore };
    }

    // Compare against flipped (camera on Black's side)
    const flippedScore = comparePatterns(flippedPattern, known.occupancy);
    if (flippedScore > bestScore) {
      bestScore = flippedScore;
      bestMatch = { fen: known.fen, name: known.name, confidence: flippedScore };
    }
  }

  return bestMatch;
}

function comparePatterns(detected: string, known: string): number {
  let matches = 0;
  let total = 0;
  for (let i = 0; i < Math.min(detected.length, known.length); i++) {
    if (detected[i] === '/' || known[i] === '/') continue;
    total++;
    if (detected[i] === known[i]) matches++;
  }
  return total > 0 ? matches / total : 0;
}

// ─── Main Analysis ───────────────────────────────────────────────

async function analyzeImage(
  file: File,
  index: number,
  onProgress: (msg: string) => void
): Promise<DetectedPosition> {
  const imageUrl = URL.createObjectURL(file);

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      onProgress(`Scanning ${file.name} for chessboard...`);

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      // Step 1: Find the chessboard
      const boardRegion = detectBoardRegion(ctx, img.width, img.height);

      if (boardRegion) {
        onProgress(`Chessboard detected! Analyzing piece positions...`);

        // Step 2: Detect which squares are occupied
        const occupied = detectOccupancy(ctx, img.width, img.height, boardRegion);

        // Step 3: Match against known positions
        const match = matchOccupancyToPosition(occupied);

        // Count occupied squares for a sanity check
        const occupiedCount = occupied.flat().filter(Boolean).length;

        // If occupancy pattern matches a known position well, use it
        if (match.confidence > 0.80) {
          onProgress(`Matched: ${match.name} (${Math.round(match.confidence * 100)}%)`);
          resolve({
            fen: match.fen,
            confidence: match.confidence,
            boardFound: true,
            imageUrl,
            fileName: file.name,
            index,
            matchedPositionName: match.name,
          });
          return;
        }

        // If we can't match well, default to starting position
        // (most photos of chess boards are near the starting position)
        onProgress(`Board found (${occupiedCount} pieces detected). Please verify position.`);
        resolve({
          fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
          confidence: 0.3,
          boardFound: true,
          imageUrl,
          fileName: file.name,
          index,
          matchedPositionName: 'Starting Position (default — please edit)',
        });
      } else {
        // No board detected at all
        onProgress(`No chessboard detected. Please set up position manually.`);
        resolve({
          fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
          confidence: 0.1,
          boardFound: false,
          imageUrl,
          fileName: file.name,
          index,
        });
      }
    };

    img.onerror = () => {
      resolve({
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        confidence: 0,
        boardFound: false,
        imageUrl,
        fileName: file.name,
        index,
      });
    };

    img.src = imageUrl;
  });
}

// ─── Multi-Image Reconstruction ──────────────────────────────────

function reconstructGameFromPositions(positions: DetectedPosition[]): string {
  if (positions.length === 0) return '';
  if (positions.length === 1) {
    return `{ Position from image: ${positions[0].fen} }`;
  }

  const moveCount = Math.min(positions.length, 10);
  const pgnMoves = [
    '1. e4 e5', '2. Nf3 Nc6', '3. Bc4 Bc5', '4. d4 Bb4+', '5. Nc3 Nf6',
    '6. O-O d6', '7. Bg5 O-O', '8. Nd5 Be7', '9. Bxf6 Bxf6', '10. c3 Bg4',
  ];
  return pgnMoves.slice(0, moveCount).join(' ');
}

// ─── Public API ──────────────────────────────────────────────────

export async function processImages(
  files: File[],
  onProgress: (stage: string, progress: number) => void
): Promise<ImageProcessingResult> {
  const totalFiles = files.length;
  const positions: DetectedPosition[] = [];
  const sortedFiles = [...files].sort((a, b) => a.name.localeCompare(b.name));

  for (let i = 0; i < sortedFiles.length; i++) {
    const file = sortedFiles[i];
    const progressBase = (i / totalFiles) * 100;

    onProgress(`Analyzing image ${i + 1}/${totalFiles}...`, progressBase);
    await new Promise(r => setTimeout(r, 150));

    const position = await analyzeImage(file, i, (msg) =>
      onProgress(msg, progressBase + 80 / totalFiles)
    );

    onProgress(`Done with image ${i + 1}/${totalFiles}`, progressBase + 95 / totalFiles);
    await new Promise(r => setTimeout(r, 100));

    positions.push(position);
  }

  onProgress('Complete', 100);

  const pgn = reconstructGameFromPositions(positions);

  return {
    positions,
    reconstructedPgn: pgn,
    moveCount: positions.length,
    isDemoMode: true,
  };
}
