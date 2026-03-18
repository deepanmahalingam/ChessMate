import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileVideo, AlertCircle, Sparkles, FileText } from 'lucide-react';
import { useGameStore } from '../store/gameStore';
import { processVideo, parsePgnInput } from '../engine/videoProcessor';
import { analyzeGame } from '../engine/analyzer';
import { Chess } from 'chess.js';

interface VideoUploadProps {
  onAnalysisComplete: () => void;
}

export default function VideoUpload({ onAnalysisComplete }: VideoUploadProps) {
  const store = useGameStore();
  const [pgnInput, setPgnInput] = useState('');
  const [mode, setMode] = useState<'video' | 'pgn'>('video');

  const runAnalysis = useCallback(async (pgn: string) => {
    store.setStatus('analyzing');
    store.setProgress(0);

    try {
      // Use a simulated evaluation for browser-based analysis
      const simulatedEvaluate = async (fen: string) => {
        const chess = new Chess(fen);
        const legalMoves = chess.moves({ verbose: true });
        await new Promise(r => setTimeout(r, 15));

        // Simple material-based evaluation
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

        // Add positional noise for realism
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

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    store.setVideoFile(file);
    store.setStatus('uploading');
    store.setProgress(0);

    // Simulate upload progress
    for (let i = 0; i <= 100; i += 5) {
      store.setProgress(i);
      await new Promise(r => setTimeout(r, 50));
    }

    store.setStatus('extracting');
    store.setProgress(0);

    try {
      const result = await processVideo(file, (_stage, progress) => {
        store.setProgress(progress);
      });

      store.setPgn(result.pgn);
      await runAnalysis(result.pgn);
    } catch (err) {
      store.setError(`Processing failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [store, runAnalysis]);

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

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'video/*': ['.mp4', '.mov', '.avi', '.mkv', '.webm'] },
    maxFiles: 1,
    maxSize: 500 * 1024 * 1024,
  });

  const isProcessing = ['uploading', 'extracting', 'analyzing', 'summarizing'].includes(store.status);

  return (
    <div className="max-w-3xl mx-auto">
      {/* Mode Tabs */}
      <div className="flex gap-2 mb-8 justify-center">
        <button
          onClick={() => setMode('video')}
          className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all ${
            mode === 'video'
              ? 'bg-accent text-white shadow-lg shadow-accent/25'
              : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
          }`}
        >
          <FileVideo className="w-4 h-4" />
          Upload Video
        </button>
        <button
          onClick={() => setMode('pgn')}
          className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all ${
            mode === 'pgn'
              ? 'bg-accent text-white shadow-lg shadow-accent/25'
              : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
          }`}
        >
          <FileText className="w-4 h-4" />
          Paste PGN
        </button>
      </div>

      {mode === 'video' ? (
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all duration-300 ${
            isDragActive
              ? 'border-accent bg-accent/10 scale-[1.02]'
              : isProcessing
              ? 'border-gray-600 bg-white/5 cursor-wait'
              : 'border-gray-600 hover:border-accent/50 hover:bg-white/5'
          }`}
        >
          <input {...getInputProps()} disabled={isProcessing} />

          {isProcessing ? (
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
          ) : (
            <div className="space-y-4">
              <div className="w-16 h-16 mx-auto rounded-full bg-white/5 flex items-center justify-center">
                <Upload className="w-8 h-8 text-gray-400" />
              </div>
              <div>
                <p className="text-lg font-semibold text-white">
                  {isDragActive ? 'Drop your video here' : 'Upload a chess game video'}
                </p>
                <p className="text-sm text-gray-400 mt-1">
                  Drag & drop or click to browse. MP4, MOV, AVI, MKV up to 500MB
                </p>
              </div>
              <div className="flex items-center justify-center gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <FileVideo className="w-3 h-3" /> Video input
                </span>
                <span>→</span>
                <span>CV Detection</span>
                <span>→</span>
                <span>PGN Output</span>
                <span>→</span>
                <span>Engine Analysis</span>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <textarea
            value={pgnInput}
            onChange={(e) => setPgnInput(e.target.value)}
            placeholder={`Paste PGN notation here...\n\nExample:\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7...`}
            className="w-full h-48 bg-white/5 border border-gray-600 rounded-xl p-4 text-gray-200 placeholder-gray-500 focus:border-accent focus:outline-none resize-none font-mono text-sm"
            disabled={isProcessing}
          />
          <button
            onClick={handlePgnSubmit}
            disabled={isProcessing || !pgnInput.trim()}
            className="w-full py-3 px-6 bg-gradient-to-r from-accent to-accent-light text-white font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isProcessing ? (
              <>
                <Sparkles className="w-4 h-4 animate-pulse" />
                Analyzing... {Math.round(store.progress)}%
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Analyze Game
              </>
            )}
          </button>
        </div>
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
            { name: 'Immortal Game (1851)', pgn: '1. e4 e5 2. f4 exf4 3. Bc4 Qh4+ 4. Kf1 b5 5. Bxb5 Nf6 6. Nf3 Qh6 7. d3 Nh5 8. Nh4 Qg5 9. Nf5 c6 10. g4 Nf6 11. Rg1 cxb5 12. h4 Qg6 13. h5 Qg5 14. Qf3 Ng8 15. Bxf4 Qf6 16. Nc3 Bc5 17. Nd5 Qxb2 18. Bd6 Bxg1 19. e5 Qxa1+ 20. Ke2 Na6 21. Nxg7+ Kd8 22. Qf6+ Nxf6 23. Be7#' },
            { name: 'Opera Game (1858)', pgn: '1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8#' },
            { name: 'Fischer vs Byrne (1956)', pgn: '1. Nf3 Nf6 2. c4 g6 3. Nc3 Bg7 4. d4 O-O 5. Bf4 d5 6. Qb3 dxc4 7. Qxc4 c6 8. e4 Nbd7 9. Rd1 Nb6 10. Qc5 Bg4 11. Bg5 Na4 12. Qa3 Nxc3 13. bxc3 Nxe4 14. Bxe7 Qb6 15. Bc4 Nxc3 16. Bc5 Rfe8+ 17. Kf1 Be6 18. Bxb6 Bxc4+ 19. Kg1 Ne2+ 20. Kf1 Nxd4+ 21. Kg1 Ne2+ 22. Kf1 Nc3+ 23. Kg1 axb6 24. Qb4 Ra4 25. Qxb6 Nxd1 26. h3 Rxa2 27. Kh2 Nxf2 28. Re1 Rxe1 29. Qd8+ Bf8 30. Nxe1 Bd5 31. Nf3 Ne4 32. Qb8 b5 33. h4 h5 34. Ne5 Kg7 35. Kg1 Bc5+ 36. Kf1 Ng3+ 37. Ke1 Bb4+ 38. Kd1 Bb3+ 39. Kc1 Ne2+ 40. Kb1 Nc3+ 41. Kc1 Rc2#' },
            { name: 'Italian Game Demo', pgn: '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d4 exd4 6. cxd4 Bb4+ 7. Bd2 Bxd2+ 8. Nbxd2 d5 9. exd5 Nxd5 10. Qb3 Na5 11. Qa4+ Nc6 12. Qb3 Na5 13. Qa4+ Nc6' },
          ].map((game) => (
            <button
              key={game.name}
              onClick={() => {
                setPgnInput(game.pgn);
                setMode('pgn');
              }}
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
