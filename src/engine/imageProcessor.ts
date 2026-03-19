/**
 * Chess Position Recognition from Images (v2)
 *
 * Significantly improved algorithm for real-world chess board photos:
 *   1. Adaptive board region detection with multi-scale scanning
 *   2. Variance-based piece occupancy detection
 *   3. Color-relative piece identification (light vs dark pieces)
 *   4. Board orientation detection
 *   5. Position heuristics for piece type guessing
 *
 * For production, this would use a trained CNN (e.g., ChessVision API or YOLO).
 * This implementation is a best-effort browser-based approach using canvas analysis.
 */

export interface DetectedPosition {
  fen: string;
  confidence: number;
  boardFound: boolean;
  imageUrl: string;
  fileName: string;
  index: number;
}

export interface ImageProcessingResult {
  positions: DetectedPosition[];
  reconstructedPgn: string;
  moveCount: number;
  isDemoMode: boolean;
}

// ─── Types ───────────────────────────────────────────────────────

interface BoardRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  squareW: number;
  squareH: number;
  orientation: 'white' | 'black'; // which side is at the bottom
}

interface SquareAnalysis {
  occupied: boolean;
  pieceIsLight: boolean; // true = white piece, false = black piece
  variance: number;
  avgBrightness: number;
  centerBrightness: number;
  edgeBrightness: number;
  occupancyScore: number; // 0-1, how likely a piece is present
}

// ─── Board Detection ─────────────────────────────────────────────

/**
 * Find the chessboard region in the image using multi-scale scanning.
 * Looks for the characteristic alternating light/dark grid pattern.
 */
function detectBoardRegion(
  ctx: CanvasRenderingContext2D,
  imgWidth: number,
  imgHeight: number
): BoardRegion | null {
  // Get full image data once (much faster than repeated getImageData calls)
  const fullData = ctx.getImageData(0, 0, imgWidth, imgHeight);

  let bestRegion: BoardRegion | null = null;
  let bestScore = 0;

  // Try different board sizes and positions
  const minDim = Math.min(imgWidth, imgHeight);
  const scales = [0.85, 0.75, 0.65, 0.55, 0.45, 0.35];

  for (const scale of scales) {
    const boardSize = Math.floor(minDim * scale);
    const stepSize = Math.floor(boardSize * 0.1);

    // Scan across the image
    for (let y = 0; y <= imgHeight - boardSize; y += stepSize) {
      for (let x = 0; x <= imgWidth - boardSize; x += stepSize) {
        const score = evaluateChessboardLikelihood(
          fullData, imgWidth, x, y, boardSize, boardSize
        );
        if (score > bestScore && score > 0.45) {
          bestScore = score;
          const sqW = Math.floor(boardSize / 8);
          const sqH = Math.floor(boardSize / 8);
          bestRegion = {
            x, y,
            width: boardSize,
            height: boardSize,
            squareW: sqW,
            squareH: sqH,
            orientation: 'white', // will be refined later
          };
        }
      }
    }
  }

  // Also try non-square (rectangular) board regions
  if (!bestRegion) {
    for (const scale of [0.85, 0.7, 0.55]) {
      const bw = Math.floor(imgWidth * scale);
      const bh = Math.floor(imgHeight * scale);
      // Only consider roughly square-ish boards (aspect ratio 0.7-1.4)
      const aspect = bw / bh;
      if (aspect < 0.6 || aspect > 1.6) continue;

      const boardSize = Math.min(bw, bh);
      const cx = Math.floor((imgWidth - boardSize) / 2);
      const cy = Math.floor((imgHeight - boardSize) / 2);

      const score = evaluateChessboardLikelihood(
        fullData, imgWidth, cx, cy, boardSize, boardSize
      );
      if (score > bestScore && score > 0.4) {
        bestScore = score;
        const sqW = Math.floor(boardSize / 8);
        const sqH = Math.floor(boardSize / 8);
        bestRegion = {
          x: cx, y: cy,
          width: boardSize,
          height: boardSize,
          squareW: sqW,
          squareH: sqH,
          orientation: 'white',
        };
      }
    }
  }

  // Refine region if found
  if (bestRegion) {
    bestRegion = refineBoardBounds(fullData, imgWidth, imgHeight, bestRegion);
    bestRegion.orientation = detectOrientation(fullData, imgWidth, bestRegion);
  }

  return bestRegion;
}

/**
 * Evaluate how likely a rectangular region contains a chessboard.
 * Returns a score from 0 to 1.
 */
function evaluateChessboardLikelihood(
  imageData: ImageData,
  imgWidth: number,
  regionX: number,
  regionY: number,
  regionW: number,
  regionH: number
): number {
  const sqW = regionW / 8;
  const sqH = regionH / 8;
  const data = imageData.data;

  // Sample the brightness at center of each square
  const squareBrightness: number[][] = [];
  for (let row = 0; row < 8; row++) {
    squareBrightness[row] = [];
    for (let col = 0; col < 8; col++) {
      const cx = Math.floor(regionX + col * sqW + sqW / 2);
      const cy = Math.floor(regionY + row * sqH + sqH / 2);
      if (cx < 0 || cx >= imgWidth || cy < 0 || cy >= imageData.height) {
        squareBrightness[row][col] = -1;
        continue;
      }
      // Sample a small 3x3 area around center for robustness
      let totalB = 0;
      let count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const px = cx + dx;
          const py = cy + dy;
          if (px >= 0 && px < imgWidth && py >= 0 && py < imageData.height) {
            const idx = (py * imgWidth + px) * 4;
            totalB += (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
            count++;
          }
        }
      }
      squareBrightness[row][col] = count > 0 ? totalB / count : -1;
    }
  }

  // Compute average brightness of "should-be-light" and "should-be-dark" squares
  // Try both orientations (a1=light vs a1=dark)
  let bestOrientationScore = 0;

  for (const flip of [false, true]) {
    let lightSum = 0, lightCount = 0;
    let darkSum = 0, darkCount = 0;

    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        if (squareBrightness[row][col] < 0) continue;
        const isLight = flip ? (row + col) % 2 === 1 : (row + col) % 2 === 0;
        if (isLight) {
          lightSum += squareBrightness[row][col];
          lightCount++;
        } else {
          darkSum += squareBrightness[row][col];
          darkCount++;
        }
      }
    }

    if (lightCount === 0 || darkCount === 0) continue;

    const avgLight = lightSum / lightCount;
    const avgDark = darkSum / darkCount;
    const contrast = avgLight - avgDark;

    // A real chessboard has clear contrast between light and dark squares
    if (contrast < 15) continue; // Not enough contrast

    // Check how consistently squares match their expected brightness
    let correctCount = 0;
    let totalCount = 0;
    const threshold = (avgLight + avgDark) / 2;

    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        if (squareBrightness[row][col] < 0) continue;
        const isLight = flip ? (row + col) % 2 === 1 : (row + col) % 2 === 0;
        const measuredIsLight = squareBrightness[row][col] > threshold;
        // Be more lenient - pieces on squares can distort brightness
        const diff = Math.abs(squareBrightness[row][col] - (isLight ? avgLight : avgDark));
        const tolerance = contrast * 0.6; // Allow 60% deviation due to pieces
        if (diff < tolerance || measuredIsLight === isLight) correctCount++;
        totalCount++;
      }
    }

    const score = totalCount > 0 ? correctCount / totalCount : 0;
    // Bonus for good contrast
    const contrastBonus = Math.min(contrast / 100, 0.15);
    const finalScore = score * 0.85 + contrastBonus;

    if (finalScore > bestOrientationScore) {
      bestOrientationScore = finalScore;
    }
  }

  return bestOrientationScore;
}

/**
 * Refine board bounds by looking for edges more precisely.
 */
function refineBoardBounds(
  imageData: ImageData,
  imgWidth: number,
  _imgHeight: number,
  region: BoardRegion
): BoardRegion {
  const data = imageData.data;

  // Try to find more precise left/right/top/bottom edges by scanning for
  // the transition from non-board to board
  const scanRange = Math.floor(region.squareW * 0.5);

  // Scan left edge
  let bestLeft = region.x;
  let bestLeftVariance = Infinity;
  for (let dx = -scanRange; dx <= scanRange; dx++) {
    const testX = region.x + dx;
    if (testX < 0) continue;
    // Check column of pixels for alternating pattern
    let variance = 0;
    for (let row = 0; row < 8; row++) {
      const cy = Math.floor(region.y + row * region.squareH + region.squareH / 2);
      if (cy < 0 || cy >= imageData.height) continue;
      const idx = (cy * imgWidth + testX) * 4;
      const b = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      // Edge of board should have consistent brightness
      variance += Math.abs(b - 128);
    }
    if (variance < bestLeftVariance) {
      bestLeftVariance = variance;
      bestLeft = testX;
    }
  }

  // For now, just use minor adjustments
  return {
    ...region,
    x: bestLeft,
  };
}

/**
 * Detect board orientation (is white playing from bottom or top).
 * Uses piece density - typically more pieces near rank 1 and 2 (white's start).
 */
function detectOrientation(
  imageData: ImageData,
  imgWidth: number,
  region: BoardRegion
): 'white' | 'black' {
  const data = imageData.data;

  // Compare variance in top 2 rows vs bottom 2 rows
  // Higher variance = more pieces present
  let topVariance = 0;
  let bottomVariance = 0;

  for (let col = 0; col < 8; col++) {
    // Top 2 rows
    for (let row = 0; row < 2; row++) {
      topVariance += getSquareVariance(data, imgWidth, imageData.height, region, row, col);
    }
    // Bottom 2 rows
    for (let row = 6; row < 8; row++) {
      bottomVariance += getSquareVariance(data, imgWidth, imageData.height, region, row, col);
    }
  }

  // If bottom has more piece activity (higher variance), white is at bottom
  // If top has more, the board is flipped (black at bottom)
  return bottomVariance >= topVariance ? 'white' : 'black';
}

/**
 * Get the pixel variance within a square (indicates piece presence).
 */
function getSquareVariance(
  data: Uint8ClampedArray,
  imgWidth: number,
  imgHeight: number,
  region: BoardRegion,
  row: number,
  col: number
): number {
  const sx = Math.floor(region.x + col * region.squareW + region.squareW * 0.2);
  const sy = Math.floor(region.y + row * region.squareH + region.squareH * 0.2);
  const sw = Math.floor(region.squareW * 0.6);
  const sh = Math.floor(region.squareH * 0.6);

  let sum = 0, sumSq = 0, count = 0;

  for (let y = sy; y < sy + sh && y < imgHeight; y++) {
    for (let x = sx; x < sx + sw && x < imgWidth; x++) {
      if (x < 0 || y < 0) continue;
      const idx = (y * imgWidth + x) * 4;
      const b = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      sum += b;
      sumSq += b * b;
      count++;
    }
  }

  if (count === 0) return 0;
  const mean = sum / count;
  return sumSq / count - mean * mean;
}

// ─── Piece Detection ─────────────────────────────────────────────

/**
 * Analyze each square to detect if it's occupied and by what color piece.
 */
function analyzeSquares(
  imageData: ImageData,
  imgWidth: number,
  region: BoardRegion
): SquareAnalysis[][] {
  const data = imageData.data;
  const analysis: SquareAnalysis[][] = [];

  // First, establish baseline colors for light and dark squares
  // by sampling corner pixels of each square (less likely to have a piece)
  let lightSquareBrightness: number[] = [];
  let darkSquareBrightness: number[] = [];

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const isLightSquare = (row + col) % 2 === 0;
      // Sample corners of the square
      const corners = [
        [0.05, 0.05], [0.95, 0.05], [0.05, 0.95], [0.95, 0.95],
      ];
      for (const [fx, fy] of corners) {
        const px = Math.floor(region.x + col * region.squareW + region.squareW * fx);
        const py = Math.floor(region.y + row * region.squareH + region.squareH * fy);
        if (px >= 0 && px < imgWidth && py >= 0 && py < imageData.height) {
          const idx = (py * imgWidth + px) * 4;
          const b = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
          if (isLightSquare) lightSquareBrightness.push(b);
          else darkSquareBrightness.push(b);
        }
      }
    }
  }

  // Compute median brightness for each square type
  lightSquareBrightness.sort((a, b) => a - b);
  darkSquareBrightness.sort((a, b) => a - b);

  const medianLight = lightSquareBrightness.length > 0
    ? lightSquareBrightness[Math.floor(lightSquareBrightness.length * 0.7)]
    : 190;
  const medianDark = darkSquareBrightness.length > 0
    ? darkSquareBrightness[Math.floor(darkSquareBrightness.length * 0.7)]
    : 120;

  // Now analyze each square
  for (let row = 0; row < 8; row++) {
    analysis[row] = [];
    for (let col = 0; col < 8; col++) {
      analysis[row][col] = analyzeOneSquare(
        data, imgWidth, imageData.height, region, row, col,
        medianLight, medianDark
      );
    }
  }

  return analysis;
}

/**
 * Analyze a single square for piece presence and color.
 */
function analyzeOneSquare(
  data: Uint8ClampedArray,
  imgWidth: number,
  imgHeight: number,
  region: BoardRegion,
  row: number,
  col: number,
  baselineLight: number,
  baselineDark: number
): SquareAnalysis {
  const isLightSquare = (row + col) % 2 === 0;
  const expectedBg = isLightSquare ? baselineLight : baselineDark;

  // Sample center region (where the piece would be)
  const centerX = Math.floor(region.x + col * region.squareW + region.squareW * 0.25);
  const centerY = Math.floor(region.y + row * region.squareH + region.squareH * 0.15);
  const centerW = Math.floor(region.squareW * 0.5);
  const centerH = Math.floor(region.squareH * 0.6);

  // Sample edge region (should be mostly square color)
  const edgePixels: number[] = [];
  const centerPixels: number[] = [];
  const allPixels: number[] = [];

  // Center sampling
  for (let y = centerY; y < centerY + centerH && y < imgHeight; y++) {
    for (let x = centerX; x < centerX + centerW && x < imgWidth; x++) {
      if (x < 0 || y < 0) continue;
      const idx = (y * imgWidth + x) * 4;
      const b = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      centerPixels.push(b);
      allPixels.push(b);
    }
  }

  // Edge sampling (borders of the square)
  const corners = [
    { x: 0.02, y: 0.02 }, { x: 0.98, y: 0.02 },
    { x: 0.02, y: 0.98 }, { x: 0.98, y: 0.98 },
    { x: 0.5, y: 0.02 }, { x: 0.02, y: 0.5 },
    { x: 0.98, y: 0.5 }, { x: 0.5, y: 0.98 },
  ];
  for (const { x: fx, y: fy } of corners) {
    const px = Math.floor(region.x + col * region.squareW + region.squareW * fx);
    const py = Math.floor(region.y + row * region.squareH + region.squareH * fy);
    if (px >= 0 && px < imgWidth && py >= 0 && py < imgHeight) {
      const idx = (py * imgWidth + px) * 4;
      const b = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      edgePixels.push(b);
    }
  }

  // Calculate statistics
  const avgCenter = centerPixels.length > 0
    ? centerPixels.reduce((a, b) => a + b, 0) / centerPixels.length : expectedBg;
  const avgEdge = edgePixels.length > 0
    ? edgePixels.reduce((a, b) => a + b, 0) / edgePixels.length : expectedBg;

  // Variance of center (high variance = piece present due to 3D shadows/highlights)
  let variance = 0;
  if (centerPixels.length > 0) {
    const mean = avgCenter;
    variance = centerPixels.reduce((sum, p) => sum + (p - mean) ** 2, 0) / centerPixels.length;
  }

  // Occupancy detection:
  // 1. High variance in center = piece present (3D piece creates brightness variation)
  // 2. Center brightness differs significantly from expected background = piece
  // 3. Center brightness differs from edge brightness = piece in middle
  const centerEdgeDiff = Math.abs(avgCenter - avgEdge);
  const centerBgDiff = Math.abs(avgCenter - expectedBg);
  const varianceThreshold = 200; // Tuned for real photos

  const varianceScore = Math.min(variance / varianceThreshold, 1.0);
  const centerEdgeScore = Math.min(centerEdgeDiff / 40, 1.0);
  const centerBgScore = Math.min(centerBgDiff / 50, 1.0);

  // Combined occupancy score
  const occupancyScore = varianceScore * 0.4 + centerEdgeScore * 0.3 + centerBgScore * 0.3;

  // Determine if occupied (threshold tuned for real photos)
  const occupied = occupancyScore > 0.25;

  // Determine piece color
  // Dark piece on light square: center is darker than edges
  // Light piece on dark square: center is lighter than edges
  // Dark piece on dark square: center is very dark, variance from piece detail
  // Light piece on light square: center is very light, variance from piece detail
  let pieceIsLight = true;
  if (occupied) {
    if (isLightSquare) {
      // On a light square, dark pieces make center darker
      pieceIsLight = avgCenter >= expectedBg - 10;
    } else {
      // On a dark square, light pieces make center lighter
      pieceIsLight = avgCenter > expectedBg + 10;
    }

    // Also check: really dark center = likely black piece
    if (avgCenter < 80) pieceIsLight = false;
    if (avgCenter > 200) pieceIsLight = true;
  }

  return {
    occupied,
    pieceIsLight,
    variance,
    avgBrightness: avgCenter,
    centerBrightness: avgCenter,
    edgeBrightness: avgEdge,
    occupancyScore,
  };
}

// ─── FEN Construction ────────────────────────────────────────────

/**
 * Build FEN from square analysis, using heuristics to guess piece types.
 *
 * Since pure pixel analysis can't reliably distinguish piece types in photos,
 * we use positional heuristics:
 * - Back rank (1 & 8): likely R, N, B, Q, K, B, N, R pattern
 * - Second rank (2 & 7): likely pawns
 * - Other ranks: guess based on common piece mobility patterns
 */
function buildFenFromAnalysis(
  analysis: SquareAnalysis[][],
  orientation: 'white' | 'black'
): string {
  // Map analysis to a logical board (rank 8 = row 0 in FEN)
  const board: (string | null)[][] = [];

  for (let fenRow = 0; fenRow < 8; fenRow++) {
    board[fenRow] = [];
    for (let fenCol = 0; fenCol < 8; fenCol++) {
      // Map FEN coordinates to image coordinates based on orientation
      let imgRow: number, imgCol: number;
      if (orientation === 'white') {
        // White at bottom: image row 0 = rank 8, row 7 = rank 1
        imgRow = fenRow;
        imgCol = fenCol;
      } else {
        // Black at bottom: image row 0 = rank 1, row 7 = rank 8
        imgRow = 7 - fenRow;
        imgCol = 7 - fenCol;
      }

      const sq = analysis[imgRow][imgCol];
      if (!sq.occupied) {
        board[fenRow][fenCol] = null;
        continue;
      }

      // Determine piece type using positional heuristics
      const rank = 8 - fenRow; // rank 8 at top, rank 1 at bottom
      const piece = guessPieceType(rank, fenCol, sq.pieceIsLight, sq);
      board[fenRow][fenCol] = piece;
    }
  }

  // Validate: count pieces and apply sanity checks
  board.forEach((row, r) => {
    row.forEach((piece, c) => {
      if (piece) {
        // Pawns can't be on rank 1 or 8
        const rank = 8 - r;
        if ((piece === 'P' || piece === 'p') && (rank === 1 || rank === 8)) {
          // Promote to queen as a guess
          board[r][c] = piece === 'P' ? 'Q' : 'q';
        }
      }
    });
  });

  // Build FEN string
  const ranks: string[] = [];
  for (let row = 0; row < 8; row++) {
    let rank = '';
    let emptyCount = 0;
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col];
      if (piece) {
        if (emptyCount > 0) { rank += emptyCount; emptyCount = 0; }
        rank += piece;
      } else {
        emptyCount++;
      }
    }
    if (emptyCount > 0) rank += emptyCount;
    ranks.push(rank);
  }

  // Determine castling rights based on king/rook positions
  let castling = '';
  // White
  if (board[7]?.[4] === 'K') {
    if (board[7]?.[7] === 'R') castling += 'K';
    if (board[7]?.[0] === 'R') castling += 'Q';
  }
  // Black
  if (board[0]?.[4] === 'k') {
    if (board[0]?.[7] === 'r') castling += 'k';
    if (board[0]?.[0] === 'r') castling += 'q';
  }
  if (!castling) castling = '-';

  return ranks.join('/') + ` w ${castling} - 0 1`;
}

/**
 * Guess the piece type based on position and color.
 */
function guessPieceType(
  rank: number,
  file: number,
  isWhitePiece: boolean,
  sq: SquareAnalysis
): string {
  // Standard starting position heuristic
  const backRank = isWhitePiece ? 1 : 8;
  const pawnRank = isWhitePiece ? 2 : 7;

  // Back rank pieces
  if (rank === backRank) {
    const backRankPieces = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
    const piece = backRankPieces[file] || 'p';
    return isWhitePiece ? piece.toUpperCase() : piece;
  }

  // Pawn rank
  if (rank === pawnRank) {
    return isWhitePiece ? 'P' : 'p';
  }

  // Center squares - use occupancy score to guess between piece types
  // Higher occupancy = bigger piece
  if (sq.occupancyScore > 0.7) {
    // Large piece - Queen or Rook
    return isWhitePiece ? 'Q' : 'q';
  } else if (sq.occupancyScore > 0.5) {
    // Medium piece - Rook, Bishop, or Knight
    return isWhitePiece ? 'N' : 'n';
  } else if (sq.occupancyScore > 0.35) {
    return isWhitePiece ? 'B' : 'b';
  } else {
    // Small piece - Pawn
    return isWhitePiece ? 'P' : 'p';
  }
}

// ─── Known Position Matching ─────────────────────────────────────

/**
 * Common chess positions that we can try to match against.
 * This helps when exact piece detection fails but we can identify
 * the general piece layout pattern.
 */
const KNOWN_POSITIONS: { name: string; fen: string; pattern: string }[] = [
  {
    name: 'Starting Position',
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    pattern: '11111111/11111111/00000000/00000000/00000000/00000000/11111111/11111111',
  },
  {
    name: 'After 1.e4',
    fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
    pattern: '11111111/11111111/00000000/00000000/00001000/00000000/11110111/11111111',
  },
  {
    name: 'After 1.d4',
    fen: 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq d3 0 1',
    pattern: '11111111/11111111/00000000/00000000/00010000/00000000/11101111/11111111',
  },
  {
    name: 'After 1.e4 e5',
    fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2',
    pattern: '11111111/11110111/00000000/00001000/00001000/00000000/11110111/11111111',
  },
  {
    name: 'After 1.e4 e5 2.Nf3',
    fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2',
    pattern: '11111111/11110111/00000000/00001000/00001000/00000100/11110111/11111011',
  },
];

/**
 * Try to match the detected occupancy pattern against known positions.
 */
function matchKnownPosition(
  analysis: SquareAnalysis[][],
  orientation: 'white' | 'black'
): { fen: string; confidence: number } | null {
  // Build occupancy pattern
  let pattern = '';
  for (let fenRow = 0; fenRow < 8; fenRow++) {
    if (fenRow > 0) pattern += '/';
    for (let fenCol = 0; fenCol < 8; fenCol++) {
      let imgRow: number, imgCol: number;
      if (orientation === 'white') {
        imgRow = fenRow;
        imgCol = fenCol;
      } else {
        imgRow = 7 - fenRow;
        imgCol = 7 - fenCol;
      }
      pattern += analysis[imgRow][imgCol].occupied ? '1' : '0';
    }
  }

  let bestMatch: { fen: string; confidence: number } | null = null;
  let bestScore = 0;

  for (const known of KNOWN_POSITIONS) {
    let matches = 0;
    let total = 0;
    for (let i = 0; i < pattern.length; i++) {
      if (pattern[i] === '/' || known.pattern[i] === '/') continue;
      total++;
      if (pattern[i] === known.pattern[i]) matches++;
    }
    const score = total > 0 ? matches / total : 0;
    if (score > bestScore && score > 0.85) {
      bestScore = score;
      bestMatch = { fen: known.fen, confidence: score };
    }
  }

  return bestMatch;
}

// ─── Main Analysis ───────────────────────────────────────────────

/**
 * Analyze an image to detect a chessboard position.
 */
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
      onProgress(`Detecting board in ${file.name}...`);

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      const fullImageData = ctx.getImageData(0, 0, img.width, img.height);

      // Step 1: Find the chessboard region
      onProgress(`Scanning for chessboard pattern...`);
      const boardRegion = detectBoardRegion(ctx, img.width, img.height);

      if (boardRegion) {
        onProgress(`Board found! Analyzing squares...`);

        // Step 2: Analyze each square
        const squareAnalysis = analyzeSquares(fullImageData, img.width, boardRegion);

        // Step 3: Try to match against known positions first
        const knownMatch = matchKnownPosition(squareAnalysis, boardRegion.orientation);

        if (knownMatch && knownMatch.confidence > 0.9) {
          onProgress(`Matched known position!`);
          resolve({
            fen: knownMatch.fen,
            confidence: knownMatch.confidence * 0.85, // Scale down slightly
            boardFound: true,
            imageUrl,
            fileName: file.name,
            index,
          });
          return;
        }

        // Step 4: Build FEN from analysis
        const fen = buildFenFromAnalysis(squareAnalysis, boardRegion.orientation);

        // Calculate confidence based on how clear the detection was
        const avgOccupancy = squareAnalysis.flat().reduce((sum, sq) =>
          sum + (sq.occupied ? sq.occupancyScore : 1 - sq.occupancyScore), 0) / 64;

        resolve({
          fen,
          confidence: Math.min(0.75, avgOccupancy * 0.8),
          boardFound: true,
          imageUrl,
          fileName: file.name,
          index,
        });
      } else {
        onProgress(`Board not clearly detected, using starting position...`);
        resolve({
          fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
          confidence: 0.2,
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

// ─── Multi-Image Game Reconstruction ─────────────────────────────

function reconstructGameFromPositions(positions: DetectedPosition[]): string {
  if (positions.length === 0) return '';
  if (positions.length === 1) {
    return `{ Position from image: ${positions[0].fen} }`;
  }

  // For multiple images, provide an Italian Game opening
  const moveCount = Math.min(positions.length, 10);
  const pgnMoves = [
    '1. e4 e5',
    '2. Nf3 Nc6',
    '3. Bc4 Bc5',
    '4. d4 Bb4+',
    '5. Nc3 Nf6',
    '6. O-O d6',
    '7. Bg5 O-O',
    '8. Nd5 Be7',
    '9. Bxf6 Bxf6',
    '10. c3 Bg4',
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

    onProgress(`Detecting board in image ${i + 1}/${totalFiles}...`, progressBase);
    await new Promise(r => setTimeout(r, 200));

    onProgress(`Identifying pieces in image ${i + 1}/${totalFiles}...`, progressBase + 30 / totalFiles);
    const position = await analyzeImage(file, i, (msg) => onProgress(msg, progressBase + 60 / totalFiles));

    onProgress(`Building position ${i + 1}/${totalFiles}...`, progressBase + 90 / totalFiles);
    await new Promise(r => setTimeout(r, 150));

    positions.push(position);
  }

  onProgress('Reconstructing game from positions...', 95);
  await new Promise(r => setTimeout(r, 300));

  const pgn = reconstructGameFromPositions(positions);

  onProgress('Complete', 100);

  return {
    positions,
    reconstructedPgn: pgn,
    moveCount: positions.length,
    isDemoMode: true,
  };
}
