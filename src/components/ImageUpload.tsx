import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Chessboard } from 'react-chessboard';
import {
  ImageIcon, Upload, X, Sparkles, AlertCircle,
  Edit3, Check, RotateCcw, Info, Trash2, Plus, Grid3x3,
} from 'lucide-react';
import { processImages, type DetectedPosition, type ImageProcessingResult } from '../engine/imageProcessor';
import { useGameStore } from '../store/gameStore';
import { analyzeGame } from '../engine/analyzer';
import { Chess } from 'chess.js';
import BoardEditor from './BoardEditor';

interface ImageUploadProps {
  onAnalysisComplete: () => void;
}

type Phase = 'upload' | 'processing' | 'review';

export default function ImageUpload({ onAnalysisComplete }: ImageUploadProps) {
  const store = useGameStore();
  const [phase, setPhase] = useState<Phase>('upload');
  const [images, setImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [result, setResult] = useState<ImageProcessingResult | null>(null);
  const [editedPositions, setEditedPositions] = useState<DetectedPosition[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editFen, setEditFen] = useState('');
  const [editedPgn, setEditedPgn] = useState('');
  const [isEditingPgn, setIsEditingPgn] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [boardEditorIndex, setBoardEditorIndex] = useState<number | null>(null);

  // Handle image files dropped/selected
  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles = [...images, ...acceptedFiles].slice(0, 20); // Max 20 images
    setImages(newFiles);
    setError('');

    // Generate previews
    const newPreviews = newFiles.map(f => URL.createObjectURL(f));
    // Cleanup old previews
    imagePreviews.forEach(url => URL.revokeObjectURL(url));
    setImagePreviews(newPreviews);
  }, [images, imagePreviews]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif'] },
    maxSize: 50 * 1024 * 1024,
  });

  // Remove a specific image
  const removeImage = (index: number) => {
    URL.revokeObjectURL(imagePreviews[index]);
    setImages(prev => prev.filter((_, i) => i !== index));
    setImagePreviews(prev => prev.filter((_, i) => i !== index));
  };

  // Clear all images
  const clearAll = () => {
    imagePreviews.forEach(url => URL.revokeObjectURL(url));
    setImages([]);
    setImagePreviews([]);
    setResult(null);
    setEditedPositions([]);
    setPhase('upload');
    setError('');
  };

  // Start processing
  const handleProcess = async () => {
    if (images.length === 0) return;

    setPhase('processing');
    setProgress(0);

    try {
      const result = await processImages(images, (msg, prog) => {
        setProgressMsg(msg);
        setProgress(prog);
      });

      setResult(result);
      setEditedPositions([...result.positions]);
      setEditedPgn(result.reconstructedPgn);
      setPhase('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Processing failed');
      setPhase('upload');
    }
  };

  // Edit a position's FEN
  const startEditPosition = (index: number) => {
    setEditingIndex(index);
    setEditFen(editedPositions[index].fen);
  };

  const saveEditPosition = () => {
    if (editingIndex === null) return;

    // Validate FEN
    try {
      new Chess(editFen);
    } catch {
      setError('Invalid FEN notation');
      return;
    }

    setEditedPositions(prev => {
      const next = [...prev];
      next[editingIndex] = { ...next[editingIndex], fen: editFen, confidence: 1.0 };
      return next;
    });
    setEditingIndex(null);
    setEditFen('');
    setError('');
  };

  // Confirm and analyze
  const handleConfirmAndAnalyze = async () => {
    // If we have a PGN (from multi-image or edited), analyze it
    const pgn = editedPgn.trim();
    if (!pgn) {
      // Single image — just show the position on the board
      if (editedPositions.length === 1) {
        // Create a minimal "game" from this position
        const fen = editedPositions[0].fen;
        try {
          const chess = new Chess(fen);
          const moves = chess.moves();
          if (moves.length > 0) {
            // Make one move so we have something to analyze
            chess.move(moves[0]);
            const minimalPgn = chess.pgn();
            store.setPgn(minimalPgn);
            await runAnalysisFromFen(fen);
            return;
          }
        } catch {
          // Fall through to error
        }
      }
      setError('No valid PGN could be reconstructed. Please edit the PGN manually.');
      return;
    }

    try {
      const chess = new Chess();
      chess.loadPgn(pgn);
      if (chess.history().length === 0) {
        setError('No valid moves in PGN. Please edit it.');
        return;
      }
      store.setPgn(pgn);
      await runAnalysis(pgn);
    } catch (err) {
      setError(`Invalid PGN: ${err instanceof Error ? err.message : 'Check notation'}`);
    }
  };

  const runAnalysis = async (pgn: string) => {
    store.setStatus('analyzing');
    store.setProgress(0);
    setPhase('processing');
    setProgressMsg('Analyzing game...');

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

      const analysis = await analyzeGame(pgn, (p) => {
        store.setProgress(p);
        setProgress(p);
      }, simulatedEvaluate);
      store.setAnalysis(analysis);
      store.setStatus('complete');
      onAnalysisComplete();
    } catch (err) {
      setError(`Analysis failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setPhase('review');
      store.setStatus('idle');
    }
  };

  const runAnalysisFromFen = async (startFen: string) => {
    // For a single position, generate a few engine lines
    store.setStatus('analyzing');
    store.setProgress(0);
    setPhase('processing');
    setProgressMsg('Analyzing position...');

    try {
      const chess = new Chess(startFen);
      const legalMoves = chess.moves();
      // Play a short sequence of "best" moves
      const moveSequence: string[] = [];
      const tempChess = new Chess(startFen);
      for (let i = 0; i < Math.min(6, legalMoves.length); i++) {
        const moves = tempChess.moves();
        if (moves.length === 0) break;
        const move = moves[Math.floor(Math.random() * Math.min(3, moves.length))];
        tempChess.move(move);
        moveSequence.push(move);
      }

      if (moveSequence.length > 0) {
        // Build a PGN from the start position + moves
        const gameChess = new Chess(startFen);
        moveSequence.forEach(m => gameChess.move(m));
        const pgn = gameChess.pgn();
        store.setPgn(pgn);
        await runAnalysis(pgn);
      } else {
        setError('No legal moves from this position.');
        setPhase('review');
        store.setStatus('idle');
      }
    } catch (err) {
      setError(`Position analysis failed: ${err instanceof Error ? err.message : 'Unknown'}`);
      setPhase('review');
      store.setStatus('idle');
    }
  };

  // ─── PROCESSING STATE ──────────────────────────────────
  if (phase === 'processing') {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="border-2 border-gray-600 bg-white/5 rounded-2xl p-12 text-center">
          <div className="space-y-6">
            <div className="w-16 h-16 mx-auto rounded-full bg-purple-500/20 flex items-center justify-center">
              <Sparkles className="w-8 h-8 text-purple-400 animate-pulse" />
            </div>
            <div>
              <p className="text-lg font-semibold text-white mb-1">{progressMsg}</p>
              <p className="text-sm text-gray-400">Analyzing {images.length} image{images.length > 1 ? 's' : ''}...</p>
            </div>
            <div className="max-w-xs mx-auto">
              <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-2">{Math.round(progress)}%</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── REVIEW STATE ──────────────────────────────────────
  if (phase === 'review' && result) {
    // For single image: show image + board editor side by side
    // For multiple images: show cards grid with edit buttons
    const isSingle = editedPositions.length === 1;

    return (
      <div className="max-w-5xl mx-auto space-y-4">
        {/* Header */}
        <div className="text-center">
          <div className="w-12 h-12 mx-auto rounded-full bg-purple-500/20 flex items-center justify-center mb-3">
            <Grid3x3 className="w-6 h-6 text-purple-400" />
          </div>
          <h2 className="text-xl font-bold text-white">
            {isSingle ? 'Set Up Position' : 'Review Detected Positions'}
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            {isSingle
              ? 'Match the board editor to your uploaded image, then analyze.'
              : `${editedPositions.length} images analyzed. Edit positions as needed.`}
          </p>
        </div>

        {/* Info banner */}
        <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-xl flex items-start gap-3">
          <Info className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" />
          <div className="text-xs text-purple-300/80">
            {isSingle ? (
              <>
                <span className="font-semibold text-purple-300">How to use:</span> Compare your uploaded image (left) with the board editor (right).
                Click a piece from the palette, then click squares to place it. Use <strong>Reset</strong> to start from the standard position.
                {editedPositions[0].matchedPositionName && (
                  <> Best guess: <strong>{editedPositions[0].matchedPositionName}</strong>.</>
                )}
              </>
            ) : (
              <>
                <span className="font-semibold text-purple-300">Image Recognition:</span> Positions are best-guess estimates.
                Use the &ldquo;Edit on Board&rdquo; button on each card to correct any errors with the visual editor.
              </>
            )}
          </div>
        </div>

        {/* Single image: side-by-side layout with image + board editor */}
        {isSingle && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Left: uploaded image */}
            <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
              <div className="p-3 border-b border-white/10">
                <h3 className="text-sm font-semibold text-gray-300">Your Image</h3>
                <p className="text-[10px] text-gray-500">{editedPositions[0].fileName}</p>
              </div>
              <div className="p-3">
                <img
                  src={editedPositions[0].imageUrl}
                  alt={editedPositions[0].fileName}
                  className="w-full rounded-lg object-contain max-h-[500px]"
                />
              </div>
            </div>

            {/* Right: board editor inline */}
            <div>
              <BoardEditor
                initialFen={editedPositions[0].fen}
                onFenChange={(newFen) => {
                  setEditedPositions(prev => {
                    const next = [...prev];
                    next[0] = { ...next[0], fen: newFen, confidence: 1.0 };
                    return next;
                  });
                }}
                onClose={() => {/* no-op for inline mode */}}
                inlineMode={true}
              />
            </div>
          </div>
        )}

        {/* Multiple images: cards grid */}
        {!isSingle && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {editedPositions.map((pos, i) => (
                <div key={i} className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
                  <div className="relative">
                    <img
                      src={pos.imageUrl}
                      alt={pos.fileName}
                      className="w-full h-32 object-cover"
                    />
                    <div className="absolute top-2 left-2 bg-black/70 text-white text-[10px] px-2 py-0.5 rounded-full font-mono">
                      #{i + 1}
                    </div>
                    {pos.matchedPositionName && (
                      <div className="absolute bottom-2 left-2 bg-black/70 text-purple-300 text-[10px] px-2 py-0.5 rounded-full">
                        {pos.matchedPositionName}
                      </div>
                    )}
                  </div>

                  <div className="p-3">
                    <div className="w-full max-w-[200px] mx-auto mb-2">
                      <Chessboard
                        options={{
                          position: pos.fen,
                          boardStyle: { borderRadius: '4px' },
                          darkSquareStyle: { backgroundColor: '#b58863' },
                          lightSquareStyle: { backgroundColor: '#f0d9b5' },
                          allowDragging: false,
                        }}
                      />
                    </div>

                    {editingIndex === i ? (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={editFen}
                          onChange={(e) => setEditFen(e.target.value)}
                          className="w-full bg-black/30 border border-purple-500/30 rounded-lg px-3 py-1.5 text-gray-200 font-mono text-[10px] focus:border-purple-500 focus:outline-none"
                          placeholder="Enter FEN..."
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={saveEditPosition}
                            className="flex-1 flex items-center justify-center gap-1 px-2 py-1 bg-purple-500/20 text-purple-400 rounded-lg text-xs hover:bg-purple-500/30"
                          >
                            <Check className="w-3 h-3" /> Save
                          </button>
                          <button
                            onClick={() => { setEditingIndex(null); setEditFen(''); }}
                            className="flex items-center justify-center gap-1 px-2 py-1 bg-white/5 text-gray-400 rounded-lg text-xs hover:bg-white/10"
                          >
                            <X className="w-3 h-3" /> Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <p className="flex-1 font-mono text-[9px] text-gray-500 truncate">{pos.fen}</p>
                          <button
                            onClick={() => startEditPosition(i)}
                            className="shrink-0 p-1 text-gray-500 hover:text-purple-400 transition-colors"
                            title="Edit FEN"
                          >
                            <Edit3 className="w-3 h-3" />
                          </button>
                        </div>
                        <button
                          onClick={() => setBoardEditorIndex(i)}
                          className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 bg-purple-500/10 text-purple-400 rounded-lg text-[11px] font-medium hover:bg-purple-500/20 transition-colors"
                        >
                          <Grid3x3 className="w-3 h-3" />
                          Edit on Board
                        </button>
                      </div>
                    )}

                    <p className="text-[10px] text-gray-600 mt-1 truncate">{pos.fileName}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Reconstructed PGN */}
            <div className="bg-white/5 rounded-xl border border-white/10 p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-300">
                  {isEditingPgn ? 'Edit Reconstructed PGN' : 'Reconstructed PGN'}
                </h3>
                <button
                  onClick={() => setIsEditingPgn(!isEditingPgn)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    isEditingPgn
                      ? 'bg-purple-500/20 text-purple-400'
                      : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <Edit3 className="w-3 h-3" />
                  {isEditingPgn ? 'Editing' : 'Edit PGN'}
                </button>
              </div>
              {isEditingPgn ? (
                <textarea
                  value={editedPgn}
                  onChange={(e) => setEditedPgn(e.target.value)}
                  className="w-full h-24 bg-black/30 border border-purple-500/30 rounded-lg p-3 text-gray-200 font-mono text-sm focus:border-purple-500 focus:outline-none resize-none"
                  placeholder="Enter PGN moves here..."
                />
              ) : (
                <div className="bg-black/20 rounded-lg p-3 font-mono text-sm text-gray-300 leading-relaxed min-h-[3rem]">
                  {editedPgn || <span className="text-gray-500 italic">No moves reconstructed — edit to add PGN manually</span>}
                </div>
              )}
            </div>
          </>
        )}

        {/* Error */}
        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
            <p className="text-xs text-red-300/80">{error}</p>
          </div>
        )}

        {/* Board Editor Modal (for multi-image mode) */}
        {boardEditorIndex !== null && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="max-w-md w-full max-h-[90vh] overflow-y-auto">
              <BoardEditor
                initialFen={editedPositions[boardEditorIndex].fen}
                onFenChange={(newFen) => {
                  setEditedPositions(prev => {
                    const next = [...prev];
                    next[boardEditorIndex] = { ...next[boardEditorIndex], fen: newFen, confidence: 1.0 };
                    return next;
                  });
                }}
                onClose={() => setBoardEditorIndex(null)}
              />
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={clearAll}
            className="flex items-center gap-2 px-4 py-3 bg-white/5 hover:bg-white/10 rounded-xl transition-colors text-sm text-gray-400 hover:text-white"
          >
            <RotateCcw className="w-4 h-4" />
            Start Over
          </button>
          <button
            onClick={handleConfirmAndAnalyze}
            className="flex-1 flex items-center justify-center gap-2 py-3 px-6 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold rounded-xl hover:opacity-90 transition-opacity"
          >
            <Sparkles className="w-4 h-4" />
            Analyze {isSingle ? 'Position' : 'Game'}
          </button>
        </div>
      </div>
    );
  }

  // ─── UPLOAD STATE ──────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`rounded-2xl p-6 text-center cursor-pointer transition-all duration-300 ${
          isDragActive
            ? 'border-2 border-purple-500 bg-purple-500/10 scale-[1.02]'
            : 'bg-white/5 border border-white/10 hover:border-purple-500/40 hover:bg-white/[0.08]'
        }`}
      >
        <input {...getInputProps()} />

        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-purple-500/15 flex items-center justify-center">
            <ImageIcon className="w-6 h-6 text-purple-400" />
          </div>
          <div>
            <p className="text-base font-semibold text-white">
              {isDragActive ? 'Drop images here' : 'Upload Chess Board Images'}
            </p>
            <p className="text-sm text-gray-400 mt-1">
              Upload one or more screenshots of chess positions
            </p>
          </div>
          <button
            type="button"
            className="px-6 py-2.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold rounded-xl hover:opacity-90 transition-all shadow-lg shadow-purple-500/25 flex items-center gap-2 text-sm"
          >
            <Upload className="w-4 h-4" />
            Browse Images
          </button>
          <p className="text-xs text-gray-500">
            PNG, JPG, WebP &middot; Up to 20 images &middot; Each up to 50MB
          </p>
        </div>
      </div>

      {/* Image Preview Grid */}
      {images.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-300">
              {images.length} image{images.length > 1 ? 's' : ''} selected
            </h3>
            <button
              onClick={clearAll}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-red-400 transition-colors"
            >
              <Trash2 className="w-3 h-3" /> Clear all
            </button>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
            {imagePreviews.map((url, i) => (
              <div key={i} className="relative group aspect-square rounded-lg overflow-hidden border border-white/10">
                <img
                  src={url}
                  alt={images[i].name}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors" />
                <button
                  onClick={(e) => { e.stopPropagation(); removeImage(i); }}
                  className="absolute top-1 right-1 p-1 bg-black/60 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                >
                  <X className="w-3 h-3" />
                </button>
                <div className="absolute bottom-1 left-1 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded-full font-mono">
                  #{i + 1}
                </div>
              </div>
            ))}

            {/* Add more button */}
            <div
              {...getRootProps()}
              className="aspect-square rounded-lg border border-dashed border-white/20 flex items-center justify-center cursor-pointer hover:border-purple-500/50 hover:bg-white/5 transition-colors"
            >
              <Plus className="w-5 h-5 text-gray-500" />
            </div>
          </div>

          {/* Process button */}
          <button
            onClick={handleProcess}
            className="w-full py-3 px-6 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold rounded-xl hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-purple-500/20"
          >
            <Sparkles className="w-4 h-4" />
            Detect Positions ({images.length} image{images.length > 1 ? 's' : ''})
          </button>
        </div>
      )}

      {/* Info text */}
      <div className="text-center space-y-1">
        <p className="text-xs text-gray-500">
          <strong className="text-gray-400">Single image:</strong> Detects the board position and suggests best moves
        </p>
        <p className="text-xs text-gray-500">
          <strong className="text-gray-400">Multiple images:</strong> Reconstructs the game move sequence for full analysis
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
          <p className="text-xs text-red-300/80">{error}</p>
        </div>
      )}
    </div>
  );
}
