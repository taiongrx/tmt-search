import { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  ArrowRightLeft, 
  Search, 
  UploadCloud, 
  Sun, 
  Moon, 
  ShieldCheck
} from 'lucide-react';
import { DashboardView } from './components/DashboardView';
import { CodeTranslator } from './components/CodeTranslator';
import { BrowserView } from './components/BrowserView';
import { MapperView } from './components/MapperView';
import type { MetaInfo } from './types/tmt';

type ViewType = 'DASHBOARD' | 'TRANSLATOR' | 'BROWSER' | 'MAPPER';

export function App() {
  const [activeView, setActiveView] = useState<ViewType>('DASHBOARD');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [meta, setMeta] = useState<MetaInfo | null>(null);

  // Initialize theme from local storage or system preference
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.setAttribute('data-theme', savedTheme);
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const initialTheme = prefersDark ? 'dark' : 'light';
      setTheme(initialTheme);
      document.documentElement.setAttribute('data-theme', initialTheme);
    }
  }, []);

  // Fetch meta info on load
  useEffect(() => {
    fetch('/data/meta.json')
      .then(res => res.json())
      .then(data => setMeta(data))
      .catch(err => console.error('Error fetching meta.json:', err));
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
    localStorage.setItem('theme', nextTheme);
  };

  const renderActiveView = () => {
    switch (activeView) {
      case 'DASHBOARD':
        return <DashboardView onNavigate={(view) => setActiveView(view)} />;
      case 'TRANSLATOR':
        return <CodeTranslator />;
      case 'BROWSER':
        return <BrowserView />;
      case 'MAPPER':
        return <MapperView />;
      default:
        return <DashboardView onNavigate={(view) => setActiveView(view)} />;
    }
  };

  return (
    <div className="app-container">
      
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="brand-section">
          <div className="brand-icon">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div className="brand-name" style={{ lineHeight: '1.2' }}>
            Little-Ong TMT
            <span className="brand-subtitle" style={{ fontSize: '0.62rem', textTransform: 'none', letterSpacing: '0px', marginTop: '2px' }}>
              Saiburi Crown Prince Hospital
            </span>
          </div>
        </div>

        <nav className="nav-links">
          <li className="nav-item">
            <button 
              className={`nav-button ${activeView === 'DASHBOARD' ? 'active' : ''}`}
              onClick={() => setActiveView('DASHBOARD')}
            >
              <LayoutDashboard /> แผงควบคุม & ค้นหาด่วน
            </button>
          </li>
          <li className="nav-item">
            <button 
              className={`nav-button ${activeView === 'TRANSLATOR' ? 'active' : ''}`}
              onClick={() => setActiveView('TRANSLATOR')}
            >
              <ArrowRightLeft /> แปลงเทียบรหัสยา & ATC
            </button>
          </li>
          <li className="nav-item">
            <button 
              className={`nav-button ${activeView === 'BROWSER' ? 'active' : ''}`}
              onClick={() => setActiveView('BROWSER')}
            >
              <Search /> สืบค้นโครงสร้าง TMT (8 ระดับ)
            </button>
          </li>
          <li className="nav-item">
            <button 
              className={`nav-button ${activeView === 'MAPPER' ? 'active' : ''}`}
              onClick={() => setActiveView('MAPPER')}
            >
              <UploadCloud /> จับคู่รหัสยาท้องถิ่น (Mapper)
            </button>
          </li>
        </nav>

        <div className="sidebar-footer">
          <div className="release-badge">
            TMT Version:<br />
            <span className="version-no">{meta?.version || 'TMTRF20260803'}</span>
          </div>
          
          <button className="theme-toggle-btn" onClick={toggleTheme}>
            {theme === 'light' ? (
              <>
                <Moon className="w-4 h-4" /> โหมดกลางคืน (Dark)
              </>
            ) : (
              <>
                <Sun className="w-4 h-4" /> โหมดกลางวัน (Light)
              </>
            )}
          </button>
        </div>
      </aside>

      {/* Main Panel Content */}
      <main className="main-content">
        {renderActiveView()}
      </main>

    </div>
  );
}

export default App;
