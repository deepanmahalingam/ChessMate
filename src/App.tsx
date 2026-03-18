import { useState } from 'react';
import Header from './components/Header';
import HomePage from './pages/HomePage';
import AnalysisPage from './pages/AnalysisPage';

type Page = 'home' | 'analysis';

function App() {
  const [page, setPage] = useState<Page>('home');

  return (
    <div className="min-h-screen flex flex-col">
      <Header onNavigate={setPage} currentPage={page} />
      <main className="flex-1">
        {page === 'home' && (
          <HomePage onAnalysisComplete={() => setPage('analysis')} />
        )}
        {page === 'analysis' && <AnalysisPage />}
      </main>
      <footer className="border-t border-white/10 py-4 text-center text-xs text-gray-500">
        ChessMate &copy; {new Date().getFullYear()} &middot; AI-Powered Chess Analysis
      </footer>
    </div>
  );
}

export default App;
