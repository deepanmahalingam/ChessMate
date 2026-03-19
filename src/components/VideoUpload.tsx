import { useCallback, useState, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  Upload, FileVideo, AlertCircle, Sparkles,
  Edit3, Check, RotateCcw, Info, ChevronDown, ChevronUp,
} from 'lucide-react';
import { useGameStore } from '../store/gameStore';
import { processVideo, parsePgnInput } from '../engine/videoProcessor';
import type { VideoProcessingResult } from '../engine/videoProcessor';
import { analyzeGame } from '../engine/analyzer';
import { Chess } from 'chess.js';

interface VideoUploadProps {
  onAnalysisComplete: () => void;
}

export default function VideoUpload({ onAnalysisComplete }: VideoUploadProps) {
  const store = useGameStore();
  const [pgnInput, setPgnInput] = useState('');

  // Review step state
  const [extractionResult, setExtractionResult] = useState<VideoProcessingResult | null>(null);
  const [reviewPgn, setReviewPgn] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [pgnError, setPgnError] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);

  const runAnalysis = useCallback(async (pgn: string) => {
    store.setStatus('analyzing');
    store.setProgress(0);

    try {
      const simulatedEvaluate = async (fen: string) => {
        const chess = new Chess(fen);
        const legalMoves = chess.moves({ verbose: true });
        await new Promise(r => setTimeout(r, 15));

        const pieceValues: Record<string, number> = { p: 1, n: 3, b: 3.2, r: 5, q: 9, k: 0 };
        let score = 0;
        const board = chess.board();
        for (const row of board) {
          for (const sq of row) {
            if (sq) {
              const val = pieceValues[sq.type] || 0;
              score += sq.color === 'w' ? val : -val;
            }
          }
        }
        score += (Math.random() - 0.5) * 0.6;
        const bestMove = legalMoves.length > 0 ? legalMoves[0].lan : '';
        return { score: Math.round(score * 100) / 100, bestMove };
      };

      const analysis = await analyzeGame(pgn, (p) => store.setProgress(p), simulatedEvaluate);
      store.setAnalysis(analysis);
      store.setStatus('complete');
      onAnalysisComplete();
    } catch (err) {
      store.setError(`Analysis failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [store, onAnalysisComplete]);

  // Video upload → extraction → review
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    // Reset any previous state
    setExtractionResult(null);
    setReviewPgn('');
    setIsEditing(false);
    setPgnError('');

    store.setVideoFile(file);
    store.setStatus('uploading');
    store.setProgress(0);

    // Simulate upload progress
    for (let i = 0; i <= 100; i += 5) {
      store.setProgress(i);
      await new Promise(r => setTimeout(r, 30));
    }

    store.setStatus('extracting');
    store.setProgress(0);

    try {
      const result = await processVideo(file, (_stage, progress) => {
        store.setProgress(progress);
      });

      // Go to review step instead of directly analyzing
      setExtractionResult(result);
      setReviewPgn(result.pgn);
      store.setPgn(result.pgn);
      store.setStatus('reviewing');
    } catch (err) {
      store.setError(`Processing failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [store]);

  // Validate PGN during review editing
  const validatePgn = (pgn: string): { valid: boolean; moveCount: number; error?: string } => {
    try {
      const chess = new Chess();
      chess.loadPgn(pgn);
      const moves = chess.history();
      if (moves.length === 0) {
        return { valid: false, moveCount: 0, error: 'No valid moves found in PGN' };
      }
      return { valid: true, moveCount: moves.length };
    } catch (err) {
      return { valid: false, moveCount: 0, error: err instanceof Error ? err.message : 'Invalid PGN format' };
    }
  };

  // Confirm reviewed PGN and run analysis
  const handleConfirmAndAnalyze = async () => {
    const validation = validatePgn(reviewPgn);
    if (!validation.valid) {
      setPgnError(validation.error || 'Invalid PGN');
      return;
    }
    setPgnError('');
    store.setPgn(reviewPgn);
    await runAnalysis(reviewPgn);
  };

  // Direct PGN submit (paste mode)
  const handlePgnSubmit = async () => {
    if (!pgnInput.trim()) return;
    const cleaned = parsePgnInput(pgnInput);
    try {
      const chess = new Chess();
      chess.loadPgn(cleaned);
      if (chess.history().length === 0) {
        store.setError('Invalid PGN: no valid moves found');
        return;
      }
      store.setPgn(cleaned);
      await runAnalysis(cleaned);
    } catch (err) {
      store.setError(`Invalid PGN format: ${err instanceof Error ? err.message : 'Check your PGN notation'}`);
    }
  };

  // Reset everything to start over
  const handleStartOver = () => {
    setExtractionResult(null);
    setReviewPgn('');
    setIsEditing(false);
    setPgnError('');
    store.setStatus('idle');
    store.setProgress(0);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'video/*': ['.mp4', '.mov', '.avi', '.mkv', '.webm'] },
    maxFiles: 1,
    maxSize: 500 * 1024 * 1024,
  });

  const isProcessing = ['uploading', 'extracting', 'analyzing', 'summarizing'].includes(store.status);
  const isReviewing = store.status === 'reviewing';

  // --- REVIEW STEP UI ---
  if (isReviewing && extractionResult) {
    const validation = validatePgn(reviewPgn);
    const formatDuration = (s: number) => {
      const m = Math.floor(s / 60);
      const sec = Math.round(s % 60);
      return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
    };

    return (
      <div className="max-w-3xl mx-auto space-y-4">
        {/* Header */}
        <div className="text-center">
          <div className="w-12 h-12 mx-auto rounded-full bg-yellow-500/20 flex items-center justify-center mb-3">
            <Edit3 className="w-6 h-6 text-yellow-400" />
          </div>
          <h2 className="text-xl font-bold text-white">Review Extracted Moves</h2>
          <p className="text-sm text-gray-400 mt-1">
            Verify the moves below are correct before analysis. Edit if needed.
          </p>
        </div>

        {/* Demo mode banner */}
        {extractionResult.isDemoMode && (
          <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl flex items-start gap-3">
            <Info className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
            <div className="text-xs text-blue-300/80">
              <span className="font-semibold text-blue-300">Demo Mode:</span> Full computer vision detection requires a backend ML pipeline.
              This demo matched your video ({formatDuration(extractionResult.videoDuration)}) to a sample game with ~{extractionResult.estimatedMoves} moves.
              You can edit the PGN below to enter your actual game moves.
            </div>
          </div>
        )}

        {/* Video preview + extraction info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Video thumbnail */}
          {store.videoUrl && (
            <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
              <video
                ref={videoPreviewRef}
                src={store.videoUrl}
                className="w-full h-40 object-cover"
                muted
              />
              <div className="p-3">
                <p className="text-xs text-gray-400 truncate">{store.videoFile?.name}</p>
                <p className="text-xs text-gray-500">
                  Duration: {formatDuration(extractionResult.videoDuration)} &middot;
                  Size: {((store.videoFile?.size || 0) / 1024 / 1024).toFixed(1)} MB
                </p>
              </div>
            </div>
          )}

          {/* Extraction summary */}
          <div className="bg-white/5 rounded-xl border border-white/10 p-4 flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-300 mb-2">Extraction Result</h3>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-400">Matched game:</span>
                  <span className="text-white font-medium">{extractionResult.gameName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Confidence:</span>
                  <span className={`font-medium ${extractionResult.confidence > 0.8 ? 'text-green-400' : 'text-yellow-400'}`}>
                    {(extractionResult.confidence * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Detected moves:</span>
                  <span className="text-white font-mono">{validation.moveCount} half-moves</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowDetails(!showDetails)}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 mt-3 transition-colors"
            >
              {showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {showDetails ? 'Hide' : 'Show'} detection details
            </button>

            {showDetails && (
              <div className="mt-2 pt-2 border-t border-white/10 text-[10px] text-gray-500 space-y-0.5">
                <p>Board detection: Simulated</p>
                <p>Perspective calibration: Auto</p>
                <p>Frame analysis: {Math.round(extractionResult.videoDuration * 30)} frames @ 30fps</p>
                <p>Move tracking: Pattern-based</p>
              </div>
            )}
          </div>
        </div>

        {/* PGN Editor */}
        <div className="bg-white/5 rounded-xl border border-white/10 p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-300">
              {isEditing ? 'Edit PGN' : 'Detected PGN'}
            </h3>
            <button
              onClick={() => setIsEditing(!isEditing)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                isEditing
                  ? 'bg-yellow-500/20 text-yellow-400'
                  : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
              }`}
            >
              <Edit3 className="w-3 h-3" />
              {isEditing ? 'Editing' : 'Edit Moves'}
            </button>
          </div>

          {isEditing ? (
            <textarea
              value={reviewPgn}
              onChange={(e) => {
                setReviewPgn(e.target.value);
                setPgnError('');
              }}
              className="w-full h-32 bg-black/30 border border-yellow-500/30 rounded-lg p-3 text-gray-200 font-mono text-sm focus:border-yellow-500 focus:outline-none resize-none"
              placeholder="Enter PGN moves here, e.g.: 1. e4 e5 2. Nf3 Nc6 ..."
            />
          ) : (
            <div className="bg-black/20 rounded-lg p-3 font-mono text-sm text-gray-300 leading-relaxed min-h-[4rem]">
              {reviewPgn}
            </div>
          )}

          {pgnError && (
            <div className="mt-2 flex items-center gap-2 text-xs text-red-400">
              <AlertCircle className="w-3 h-3" />
              {pgnError}
            </div>
          )}

          {isEditing && (
            <p className="mt-2 text-[10px] text-gray-500">
              Tip: Enter moves in standard algebraic notation (e.g., 1. e4 e5 2. Nf3 Nc6).
              The notation will be validated before analysis.
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleStartOver}
            className="flex items-center gap-2 px-4 py-3 bg-white/5 hover:bg-white/10 rounded-xl transition-colors text-sm text-gray-400 hover:text-white"
          >
            <RotateCcw className="w-4 h-4" />
            Start Over
          </button>
          <button
            onClick={handleConfirmAndAnalyze}
            disabled={!validation.valid && !isEditing}
            className="flex-1 flex items-center justify-center gap-2 py-3 px-6 bg-gradient-to-r from-accent to-accent-light text-white font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Check className="w-4 h-4" />
            Confirm & Analyze ({validation.moveCount} moves)
          </button>
        </div>
      </div>
    );
  }

  // --- NORMAL UPLOAD/PROCESSING UI ---
  return (
    <div className="max-w-3xl mx-auto">
      {/* Processing state */}
      {isProcessing ? (
        <div className="border-2 border-gray-600 bg-white/5 rounded-2xl p-12 text-center">
          <div className="space-y-6">
            <div className="w-16 h-16 mx-auto rounded-full bg-accent/20 flex items-center justify-center">
              <Sparkles className="w-8 h-8 text-accent animate-pulse" />
            </div>
            <div>
              <p className="text-lg font-semibold text-white mb-1">
                {store.status === 'uploading' && 'Uploading video...'}
                {store.status === 'extracting' && 'Extracting moves with CV...'}
                {store.status === 'analyzing' && 'Analyzing with engine...'}
                {store.status === 'summarizing' && 'Generating summary...'}
              </p>
              <p className="text-sm text-gray-400">This may take a moment</p>
            </div>
            <div className="max-w-xs mx-auto">
              <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-accent to-accent-light rounded-full transition-all duration-300"
                  style={{ width: `${store.progress}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-2">{Math.round(store.progress)}%</p>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* === OPTION 1: Upload Video === */}
          <div className="mb-6">
            <div
              {...getRootProps()}
              className={`rounded-2xl p-8 text-center cursor-pointer transition-all duration-300 ${
                isDragActive
                  ? 'border-2 border-accent bg-accent/10 scale-[1.02]'
                  : 'bg-white/5 border border-white/10 hover:border-accent/40 hover:bg-white/[0.08]'
              }`}
            >
              <input {...getInputProps()} />

              <div className="flex flex-col items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-accent/15 flex items-center justify-center">
                  <FileVideo className="w-7 h-7 text-accent" />
                </div>
                <div>
                  <p className="text-lg font-semibold text-white">
                    {isDragActive ? 'Drop your video here' : 'Upload a Chess Game Video'}
                  </p>
                  <p className="text-sm text-gray-400 mt-1">
                    Drag & drop a video file here, or click the button below
                  </p>
                </div>
                {/* Prominent browse button */}
                <button
                  type="button"
                  className="px-8 py-3 bg-gradient-to-r from-accent to-accent-light text-white font-semibold rounded-xl hover:opacity-90 transition-all shadow-lg shadow-accent/25 flex items-center gap-2"
                >
                  <Upload className="w-5 h-5" />
                  Browse Files
                </button>
                <p className="text-xs text-gray-500">
                  Supports MP4, MOV, AVI, MKV &middot; Up to 500MB
                </p>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-4 my-6">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-xs text-gray-500 font-medium uppercase tracking-wider">or paste PGN directly</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          {/* === OPTION 2: Paste PGN (Video Upload also supports this) === */}
          <div className="space-y-3">
            <textarea
              value={pgnInput}
              onChange={(e) => setPgnInput(e.target.value)}
              placeholder={`Paste PGN notation here...\n\nExample:\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7...`}
              className="w-full h-36 bg-white/5 border border-white/10 rounded-xl p-4 text-gray-200 placeholder-gray-500 focus:border-accent focus:outline-none resize-none font-mono text-sm"
            />
            <button
              onClick={handlePgnSubmit}
              disabled={!pgnInput.trim()}
              className="w-full py-3 px-6 bg-white/10 hover:bg-white/15 text-white font-semibold rounded-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2 border border-white/10"
            >
              <Sparkles className="w-4 h-4" />
              Analyze PGN
            </button>
          </div>
        </>
      )}

      {store.status === 'error' && (
        <div className="mt-4 p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-red-400 font-medium">Error</p>
            <p className="text-red-300/80 text-sm">{store.error}</p>
          </div>
        </div>
      )}

      {/* Demo Games */}
      <div className="mt-8 p-6 bg-white/5 rounded-2xl border border-white/10">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">Try a famous game:</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[
            { name: "Scholar's Mate (4 moves)", pgn: '1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7#' },
            { name: 'Legal Trap (7 moves)', pgn: '1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 4. Nc3 g6 5. Nxe5 Bxd1 6. Bxf7+ Ke7 7. Nd5#' },
            { name: 'Opera Game (17 moves)', pgn: '1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8#' },
            { name: 'Immortal Game (23 moves)', pgn: '1. e4 e5 2. f4 exf4 3. Bc4 Qh4+ 4. Kf1 b5 5. Bxb5 Nf6 6. Nf3 Qh6 7. d3 Nh5 8. Nh4 Qg5 9. Nf5 c6 10. g4 Nf6 11. Rg1 cxb5 12. h4 Qg6 13. h5 Qg5 14. Qf3 Ng8 15. Bxf4 Qf6 16. Nc3 Bc5 17. Nd5 Qxb2 18. Bd6 Bxg1 19. e5 Qxa1+ 20. Ke2 Na6 21. Nxg7+ Kd8 22. Qf6+ Nxf6 23. Be7#' },
          ].map((game) => (
            <button
              key={game.name}
              onClick={() => setPgnInput(game.pgn)}
              className="text-left p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-colors text-sm text-gray-300 hover:text-white"
            >
              {game.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
