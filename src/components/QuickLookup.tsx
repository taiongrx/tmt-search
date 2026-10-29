import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  Copy, 
  Check, 
  ExternalLink, 
  Sparkles, 
  Clock, 
  AlertCircle
} from 'lucide-react';
import type { ConceptType, SearchItem } from '../types/tmt';

interface QuickLookupProps {
  onSelectConcept?: (id: string, type: ConceptType) => void;
  onNavigateToTranslator?: (query: string) => void;
}


interface QuickResultItem {
  id: string;
  type: ConceptType;
  fsn: string;
  tradeName?: string;
  mfr?: string;
  atcCode?: string;
  atcName?: string;
  depth?: number;
}

export const QuickLookup: React.FC<QuickLookupProps> = ({ onSelectConcept, onNavigateToTranslator }) => {
  const [query, setQuery] = useState('');

  const [selectedType, setSelectedType] = useState<ConceptType | 'ALL'>('ALL');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<QuickResultItem[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [atcMap, setAtcMap] = useState<Record<string, { atc: string; name: string }>>({});
  
  // Cache of search indices
  const searchCacheRef = useRef<Record<string, SearchItem[]>>({});

  useEffect(() => {
    // Load search history from localStorage
    const saved = localStorage.getItem('tmt_quick_history');
    if (saved) {
      try {
        setHistory(JSON.parse(saved).slice(0, 6));
      } catch (e) {
        console.error(e);
      }
    }

    // Load ATC mappings
    fetch('/data/atc_mappings.json')
      .then(r => r.json())
      .then(d => setAtcMap(d))
      .catch(e => console.warn('Cannot load atc_mappings:', e));
  }, []);

  const saveHistory = (keyword: string) => {
    const clean = keyword.trim();
    if (!clean || clean.length < 2) return;
    const next = [clean, ...history.filter(h => h.toLowerCase() !== clean.toLowerCase())].slice(0, 6);
    setHistory(next);
    localStorage.setItem('tmt_quick_history', JSON.stringify(next));
  };

  // Perform multi-index search
  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      const targetTypes: ConceptType[] = selectedType === 'ALL' 
        ? ['TPU', 'GPU', 'VTM', 'SUBS', 'TTMT', 'TP', 'GP'] 
        : [selectedType];


      const found: QuickResultItem[] = [];

      for (const t of targetTypes) {
        if (!searchCacheRef.current[t]) {
          try {
            const res = await fetch(`/data/search_${t}.json`);
            if (res.ok) {
              searchCacheRef.current[t] = await res.json();
            }
          } catch (e) {
            console.error(e);
          }
        }

        const list = searchCacheRef.current[t] || [];
        for (const item of list) {
          const matchId = item.id.toLowerCase().includes(q);
          const matchFsn = item.fsn.toLowerCase().includes(q);
          const matchTrade = item.tradeName ? item.tradeName.toLowerCase().includes(q) : false;
          
          if (matchId || matchFsn || matchTrade) {
            const atcInfo = atcMap[item.id];
            found.push({
              id: item.id,
              type: t,
              fsn: item.fsn,
              tradeName: item.tradeName,
              mfr: item.mfr,
              atcCode: atcInfo ? atcInfo.atc : undefined,
              atcName: atcInfo ? atcInfo.name : undefined
            });
            if (found.length >= 40) break;
          }
        }
        if (found.length >= 40) break;
      }

      setResults(found);
      setLoading(false);
    }, 200);

    return () => clearTimeout(timer);
  }, [query, selectedType, atcMap]);

  const handleCopy = (text: string, id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const getBadgeColor = (t: ConceptType) => {
    switch (t) {
      case 'TPU': return { bg: 'hsl(195, 85%, 92%)', text: 'hsl(195, 90%, 30%)' };
      case 'GPU': return { bg: 'hsl(220, 85%, 92%)', text: 'hsl(220, 90%, 30%)' };
      case 'GP': return { bg: 'hsl(160, 75%, 92%)', text: 'hsl(160, 80%, 25%)' };
      case 'TP': return { bg: 'hsl(280, 75%, 92%)', text: 'hsl(280, 80%, 30%)' };
      case 'VTM': return { bg: 'hsl(35, 90%, 90%)', text: 'hsl(35, 95%, 28%)' };
      case 'SUBS': return { bg: 'hsl(340, 80%, 92%)', text: 'hsl(340, 85%, 32%)' };
      case 'TTMT': return { bg: 'hsl(140, 80%, 90%)', text: 'hsl(140, 90%, 25%)' };
      default: return { bg: 'hsl(210, 20%, 90%)', text: 'hsl(210, 25%, 30%)' };
    }
  };


  return (
    <div className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ 
              background: 'linear-gradient(135deg, var(--primary), var(--secondary))',
              color: 'white',
              borderRadius: 'var(--radius-sm)',
              padding: '6px',
              display: 'flex'
            }}>
              <Sparkles className="w-5 h-5" />
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>
              ค้นหารหัสยาและ ATC แบบทันที (Quick Drug & ATC Lookup)
            </h2>
          </div>
          <p className="text-muted" style={{ fontSize: '0.85rem', marginTop: '4px' }}>
            พิมพ์ชื่อยาภาษาไทย, ภาษาอังกฤษ, รหัส TMT หรือชื่อการค้า — ดึงข้อมูลและรหัส ATC ได้ทันที
          </p>
        </div>

        {/* Filter Pills */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {(['ALL', 'TPU', 'GPU', 'VTM', 'SUBS', 'TTMT'] as const).map(type => (
            <button
              key={type}
              onClick={() => setSelectedType(type)}
              style={{
                fontSize: '0.78rem',
                fontWeight: 600,
                padding: '4px 12px',
                borderRadius: 'var(--radius-full)',
                border: '1px solid',
                borderColor: selectedType === type ? 'var(--primary)' : 'var(--border)',
                background: selectedType === type ? 'var(--primary)' : 'transparent',
                color: selectedType === type ? 'white' : 'var(--text-main)',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {type === 'ALL' ? 'ทุกระดับ (All)' : type === 'TTMT' ? '🌿 TTMT (ยาแผนไทย)' : type}
            </button>
          ))}
        </div>

      </div>

      {/* Big Search Input */}
      <div style={{ position: 'relative' }}>
        <Search 
          className="w-5 h-5 text-muted" 
          style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)' }} 
        />
        <input
          type="text"
          className="search-input"
          placeholder="พิมพ์ค้นหา เช่น amoxicillin 500, paracetamol, 100014, วาร์ฟาริน..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') saveHistory(query);
          }}
          style={{
            paddingLeft: '48px',
            fontSize: '1.05rem',
            height: '52px',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-sm)'
          }}
          autoFocus
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            style={{
              position: 'absolute',
              right: '16px',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              fontSize: '0.85rem'
            }}
          >
            ล้าง
          </button>
        )}
      </div>

      {/* Search History / Suggestions */}
      {history.length > 0 && query.length < 2 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Clock className="w-3.5 h-3.5" /> ค้นหาล่าสุด:
          </span>
          {history.map(h => (
            <button
              key={h}
              onClick={() => {
                setQuery(h);
                saveHistory(h);
              }}
              style={{
                background: 'var(--bg-app)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-full)',
                padding: '2px 10px',
                fontSize: '0.75rem',
                cursor: 'pointer',
                color: 'var(--text-main)'
              }}
            >
              {h}
            </button>
          ))}
        </div>
      )}

      {/* Loading Indicator */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          กำลังค้นหาในฐานข้อมูล 112,800 รายการ...
        </div>
      )}

      {/* Results List */}
      {!loading && query.trim().length >= 2 && results.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '36px 20px',
          background: 'var(--bg-app)',
          borderRadius: 'var(--radius-md)',
          border: '1px dashed var(--border)'
        }}>
          <AlertCircle className="w-8 h-8 text-muted" style={{ margin: '0 auto 8px' }} />
          <p style={{ fontWeight: 600, color: 'var(--text-main)' }}>ไม่พบข้อมูลที่ตรงกับ "{query}"</p>
          <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: '4px' }}>
            ลองค้นด้วยชื่อสามัญภาษาอังกฤษ หรือรหัสตัวเลข TMT เช่น 100014
          </p>
        </div>
      )}

      {!loading && results.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            <span>พบ {results.length} รายการ (แสดงสูงสุด 40 รายการแรก)</span>
            <span>กดปุ่ม Copy รหัสได้ทันที</span>
          </div>

          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            maxHeight: '480px',
            overflowY: 'auto',
            paddingRight: '4px'
          }}>
            {results.map(item => {
              const badge = getBadgeColor(item.type);
              const isCopied = copiedId === item.id;
              const isCopiedAtc = copiedId === `atc-${item.id}`;

              return (
                <div
                  key={`${item.type}-${item.id}`}
                  onClick={() => {
                    if (onSelectConcept) onSelectConcept(item.id, item.type);
                    else if (onNavigateToTranslator) onNavigateToTranslator(item.id);
                  }}
                  style={{
                    padding: '12px 16px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-card)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '16px',
                    transition: 'all 0.15s ease',
                    cursor: onSelectConcept || onNavigateToTranslator ? 'pointer' : 'default'
                  }}
                  className="quick-result-card"
                >

                  {/* Left: Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{
                        background: badge.bg,
                        color: badge.text,
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-sm)'
                      }}>
                        {item.type}
                      </span>
                      <span style={{
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 700,
                        fontSize: '0.88rem',
                        color: 'var(--primary)'
                      }}>
                        {item.id}
                      </span>
                      {item.tradeName && (
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          • {item.tradeName}
                        </span>
                      )}
                    </div>

                    <p style={{
                      fontSize: '0.92rem',
                      fontWeight: 500,
                      color: 'var(--text-main)',
                      lineHeight: '1.3',
                      wordBreak: 'break-word'
                    }}>
                      {item.fsn}
                    </p>

                    {item.mfr && (
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        ผู้ผลิต: {item.mfr}
                      </p>
                    )}
                  </div>

                  {/* Right: ATC Match & Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                    {item.atcCode ? (
                      <div style={{
                        background: 'hsl(160, 75%, 93%)',
                        border: '1px solid hsl(160, 60%, 75%)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '4px 10px',
                        textAlign: 'right'
                      }}>
                        <div style={{ fontSize: '0.65rem', color: 'hsl(160, 80%, 25%)', fontWeight: 600 }}>
                          WHO-ATC
                        </div>
                        <div style={{
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 800,
                          fontSize: '0.9rem',
                          color: 'hsl(160, 90%, 20%)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}>
                          {item.atcCode}
                          <button
                            onClick={e => handleCopy(item.atcCode!, `atc-${item.id}`, e)}
                            title="คัดลอกรหัส ATC"
                            style={{
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              padding: '2px',
                              color: 'hsl(160, 80%, 25%)',
                              display: 'flex'
                            }}
                          >
                            {isCopiedAtc ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{
                        fontSize: '0.75rem',
                        color: 'var(--text-muted)',
                        background: 'var(--bg-app)',
                        padding: '4px 8px',
                        borderRadius: 'var(--radius-sm)'
                      }}>
                        Hierarchy lookup
                      </div>
                    )}

                    {/* Copy TMT Code Button */}
                    <button
                      onClick={e => handleCopy(item.id, item.id, e)}
                      className="btn btn-secondary"
                      style={{
                        padding: '6px 12px',
                        fontSize: '0.78rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                      title="คัดลอกรหัส TMT"
                    >
                      {isCopied ? <Check className="w-3.5 h-3.5 text-secondary" /> : <Copy className="w-3.5 h-3.5" />}
                      {isCopied ? 'คัดลอกแล้ว' : 'คัดลอก TMT'}
                    </button>

                    {/* Detail / Translate Link */}
                    {onNavigateToTranslator && (
                      <button
                        onClick={() => onNavigateToTranslator(item.id)}
                        className="btn"
                        style={{
                          background: 'var(--bg-app)',
                          border: '1px solid var(--border)',
                          padding: '6px 10px',
                          display: 'flex',
                          alignItems: 'center',
                          fontSize: '0.78rem',
                          color: 'var(--primary)'
                        }}
                        title="ดูสายสัมพันธ์โครงสร้างและแปลงรหัสใน Translator"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
};
