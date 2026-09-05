import React, { useState, useEffect } from 'react';
import { Search, Info, ArrowUp, ArrowDown } from 'lucide-react';
import type { ConceptType, Concept, SearchItem, RelationsMap } from '../types/tmt';

// Module-level caches to prevent duplicate concurrent network fetches
const fetchPromises: Record<string, Promise<Record<string, Concept>> | null> = {};
const loadedConcepts: Record<string, Record<string, Concept>> = {};

export const BrowserView: React.FC = () => {
  const [activeLevel, setActiveLevel] = useState<ConceptType>('TPU');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchIndex, setSearchIndex] = useState<SearchItem[]>([]);
  const [selectedConcept, setSelectedConcept] = useState<Concept | null>(null);
  
  // Relations and detail caches
  const [relations, setRelations] = useState<RelationsMap | null>(null);
  const [conceptsCache, setConceptsCache] = useState<Record<string, Record<string, Concept>>>({});
  
  // Intermediary details
  const [parentConcepts, setParentConcepts] = useState<Concept[]>([]);
  const [childConcepts, setChildConcepts] = useState<Concept[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Load search index for active level
  useEffect(() => {
    setLoading(true);
    setSelectedConcept(null);
    setParentConcepts([]);
    setChildConcepts([]);
    setSearchQuery('');

    fetch(`/data/search_${activeLevel}.json`)
      .then(res => res.json())
      .then(data => {
        setSearchIndex(data);
        setLoading(false);
      })
      .catch(err => {
        console.error(`Error loading search_${activeLevel}:`, err);
        setLoading(false);
      });
  }, [activeLevel]);

  // Load relations
  useEffect(() => {
    fetch('/data/relations.json')
      .then(res => res.json())
      .then(data => setRelations(data))
      .catch(err => console.error('Error loading relations.json:', err));
  }, []);

  // Filter search list
  const filteredItems = searchIndex
    .filter(item => 
      item.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.fsn.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.tradeName && item.tradeName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (item.mfr && item.mfr.toLowerCase().includes(searchQuery.toLowerCase()))
    )
    .slice(0, 100); // Limit to 100 items for layout performance

  // Load detail of selected concept
  const handleSelectConcept = async (id: string, type: ConceptType) => {
    setLoadingDetails(true);
    setParentConcepts([]);
    setChildConcepts([]);

    const detail = await fetchSpecificConceptDetail(id, type);

    if (detail) {
      setSelectedConcept(detail);

      // 2. Fetch parents and children metadata
      const nodeRel = relations?.[id];
      if (nodeRel) {
        // Resolve parent concepts
        const parents: Concept[] = [];
        for (const pNode of nodeRel.parents) {
          const pDetail = await fetchSpecificConceptDetail(pNode.id, pNode.type);
          if (pDetail) parents.push(pDetail);
        }
        setParentConcepts(parents);

        // Resolve child concepts
        const children: Concept[] = [];
        for (const cNode of nodeRel.children) {
          const cDetail = await fetchSpecificConceptDetail(cNode.id, cNode.type);
          if (cDetail) children.push(cDetail);
        }
        setChildConcepts(children);
      }
    }
    setLoadingDetails(false);
  };

  // Safe helper to fetch single concept detail on the fly
  const fetchSpecificConceptDetail = async (id: string, type: ConceptType): Promise<Concept | null> => {
    // Check React state cache first
    if (conceptsCache[type] && conceptsCache[type][id]) {
      return conceptsCache[type][id];
    }

    if (loadedConcepts[type]) {
      return loadedConcepts[type][id] || null;
    }

    if (!fetchPromises[type]) {
      fetchPromises[type] = fetch(`/data/concepts_${type}.json`)
        .then(res => res.json())
        .then(data => {
          loadedConcepts[type] = data;
          setConceptsCache(prev => ({ ...prev, [type]: data }));
          return data;
        })
        .catch(err => {
          fetchPromises[type] = null;
          throw err;
        });
    }

    try {
      const data = await fetchPromises[type];
      return data[id] || null;
    } catch (e) {
      return null;
    }
  };

  // Click handler to navigate inside details panel
  const handleRelationClick = (id: string, type: ConceptType) => {
    setActiveLevel(type);
    handleSelectConcept(id, type);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '24px', alignItems: 'start' }}>
      
      {/* Search Grid */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {/* Concept Level Selector tabs */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
          {(['SUBS', 'VTM', 'GP', 'TP', 'GPU', 'TPU', 'GPP', 'TPP'] as ConceptType[]).map(lvl => (
            <button
              key={lvl}
              onClick={() => setActiveLevel(lvl)}
              className={`tag type-${lvl}`}
              style={{
                cursor: 'pointer',
                opacity: activeLevel === lvl ? 1 : 0.45,
                transform: activeLevel === lvl ? 'scale(1.05)' : 'scale(1)',
                border: activeLevel === lvl ? '1.5px solid var(--text-main)' : '1px solid transparent',
                transition: 'var(--transition)'
              }}
            >
              {lvl}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div style={{ position: 'relative' }}>
          <Search className="w-4 h-4 text-muted" style={{ position: 'absolute', left: '16px', top: '15px' }} />
          <input
            type="text"
            placeholder={`ค้นหาในรหัสระดับ ${activeLevel} (พิมพ์ TMTID, ชื่อ FSN หรือผู้ผลิต)...`}
            className="input-field"
            style={{ paddingLeft: '44px' }}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Results List */}
        {loading ? (
          <div className="spinner-wrapper">
            <div className="spinner"></div>
            <p className="text-muted">กำลังดึงข้อมูลดัชนีระดับ {activeLevel}...</p>
          </div>
        ) : (
          <div className="table-wrapper" style={{ maxHeight: '550px', overflowY: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '120px' }}>TMT ID</th>
                  <th>ชื่อเต็ม Fully Specified Name (FSN)</th>
                  {activeLevel === 'TPU' || activeLevel === 'TP' ? <th>ผู้ผลิต</th> : null}
                </tr>
              </thead>
              <tbody>
                {filteredItems.map(item => (
                  <tr 
                    key={item.id} 
                    onClick={() => handleSelectConcept(item.id, activeLevel)}
                    style={{ 
                      cursor: 'pointer', 
                      backgroundColor: selectedConcept?.id === item.id ? 'var(--primary-light)' : 'transparent' 
                    }}
                  >
                    <td className="mono" style={{ fontWeight: 700 }}>{item.id}</td>
                    <td style={{ fontWeight: 550 }}>{item.fsn}</td>
                    {activeLevel === 'TPU' || activeLevel === 'TP' ? (
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{item.mfr || '-'}</td>
                    ) : null}
                  </tr>
                ))}
                {filteredItems.length === 0 && (
                  <tr>
                    <td colSpan={3} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                      ไม่พบข้อมูลที่ตรงกับตัวค้นหา
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Details Card Panel */}
      <div className="card" style={{ minHeight: '400px', display: 'flex', flexDirection: 'column' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, borderBottom: '1px solid var(--border)', paddingBottom: '12px', marginBottom: '16px' }}>
          ข้อมูลรายละเอียดแนวคิดยา (Concept Details)
        </h3>

        {loadingDetails ? (
          <div className="spinner-wrapper" style={{ margin: 'auto' }}>
            <div className="spinner"></div>
            <p className="text-muted">กำลังโหลดรายละเอียด...</p>
          </div>
        ) : selectedConcept ? (
          <div className="detail-drawer">
            <div className="drawer-header">
              <span className={`tag type-${selectedConcept.type}`} style={{ marginBottom: '8px' }}>
                {selectedConcept.type}
              </span>
              <h4 style={{ fontWeight: 700, fontSize: '1.05rem', lineHeight: '1.4' }}>{selectedConcept.fsn}</h4>
            </div>

            <div className="info-grid">
              <div className="info-item">
                <span className="info-label">TMT ID</span>
                <span className="info-value mono">{selectedConcept.id}</span>
              </div>
              <div className="info-item">
                <span className="info-label">วันที่แก้ไข (Changedate)</span>
                <span className="info-value">{selectedConcept.date || '-'}</span>
              </div>
            </div>

            {/* Render TPU detailed columns parsed from MasterTMT */}
            {selectedConcept.type === 'TPU' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: 'var(--bg-app)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                <span className="info-label" style={{ color: 'var(--primary)' }}>คุณสมบัติระดับ Trade Product Use</span>
                
                {selectedConcept.tradeName && (
                  <div className="info-item">
                    <span className="info-label">ชื่อทางการค้า (Trade Name)</span>
                    <span className="info-value" style={{ color: 'var(--primary)', fontWeight: 700 }}>{selectedConcept.tradeName}</span>
                  </div>
                )}
                
                {selectedConcept.activeIngredient && (
                  <div className="info-item">
                    <span className="info-label">ตัวยาสำคัญ (Active Ingredient)</span>
                    <span className="info-value" style={{ fontSize: '0.85rem' }}>{selectedConcept.activeIngredient}</span>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {selectedConcept.strength && (
                    <div className="info-item">
                      <span className="info-label">ความแรง (Strength)</span>
                      <span className="info-value">{selectedConcept.strength}</span>
                    </div>
                  )}
                  {selectedConcept.dosageForm && (
                    <div className="info-item">
                      <span className="info-label">รูปแบบยา (Dosage Form)</span>
                      <span className="info-value">{selectedConcept.dosageForm}</span>
                    </div>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {selectedConcept.dispUnit && (
                    <div className="info-item">
                      <span className="info-label">หน่วยการจ่าย (DispUnit)</span>
                      <span className="info-value">{selectedConcept.dispUnit}</span>
                    </div>
                  )}
                  {selectedConcept.statusLabel && (
                    <div className="info-item">
                      <span className="info-label">สถานะประกาศ</span>
                      <span className="info-value" style={{ color: selectedConcept.statusLabel === 'Active' ? 'var(--secondary)' : 'inherit' }}>
                        {selectedConcept.statusLabel}
                      </span>
                    </div>
                  )}
                </div>

                {selectedConcept.mfr && (
                  <div className="info-item">
                    <span className="info-label">ผู้ผลิตยารายละเอียด (Manufacturer)</span>
                    <span className="info-value" style={{ fontSize: '0.85rem' }}>{selectedConcept.mfr}</span>
                  </div>
                )}
              </div>
            )}

            {/* Relations Tree lists */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
              
              {/* Parents list */}
              <div>
                <span className="info-label" style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '8px' }}>
                  <ArrowUp className="w-3.5 h-3.5" /> แนวคิดต้นสาย (Parent Concepts)
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {parentConcepts.map(p => (
                    <div 
                      key={p.id} 
                      className="lineage-node" 
                      onClick={() => handleRelationClick(p.id, p.type)}
                      style={{ cursor: 'pointer', justifyContent: 'space-between' }}
                    >
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '240px' }} title={p.fsn}>
                        {p.fsn}
                      </span>
                      <span className="tag type-SUBS" style={{ backgroundColor: getTagColor(p.type), color: 'white', padding: '2px 6px', fontSize: '0.6rem' }}>
                        {p.type}
                      </span>
                    </div>
                  ))}
                  {parentConcepts.length === 0 && (
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>ไม่มีแนวคิดต้นสาย (เป็น Substance หรือ Concept บนสุด)</p>
                  )}
                </div>
              </div>

              {/* Children list */}
              <div>
                <span className="info-label" style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '8px' }}>
                  <ArrowDown className="w-3.5 h-3.5" /> แนวคิดลูกข่าย (Child Concepts)
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto' }}>
                  {childConcepts.map(c => (
                    <div 
                      key={c.id} 
                      className="lineage-node" 
                      onClick={() => handleRelationClick(c.id, c.type)}
                      style={{ cursor: 'pointer', justifyContent: 'space-between' }}
                    >
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '240px' }} title={c.fsn}>
                        {c.fsn}
                      </span>
                      <span className="tag type-TPU" style={{ backgroundColor: getTagColor(c.type), color: 'white', padding: '2px 6px', fontSize: '0.6rem' }}>
                        {c.type}
                      </span>
                    </div>
                  ))}
                  {childConcepts.length === 0 && (
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>ไม่มีแนวคิดปลายสาย (เป็น Concept ต่ำสุด)</p>
                  )}
                </div>
              </div>

            </div>

          </div>
        ) : (
          <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Info className="w-8 h-8" style={{ margin: '0 auto 8px', strokeWidth: 1.5 }} />
            <p style={{ fontSize: '0.85rem' }}>คลิกเลือกรายการยาจากตารางฝั่งซ้าย เพื่อแสดงความสัมพันธ์ต้นสาย-ปลายสายและคุณสมบัติ</p>
          </div>
        )}
      </div>

    </div>
  );
};

// Helper colors for types
function getTagColor(type: string) {
  switch (type) {
    case 'SUBS': return 'hsl(0, 80%, 45%)';
    case 'VTM': return 'hsl(35, 90%, 45%)';
    case 'GP': return 'hsl(150, 70%, 35%)';
    case 'TP': return 'hsl(190, 85%, 40%)';
    case 'GPU': return 'hsl(220, 85%, 45%)';
    case 'TPU': return 'var(--primary)';
    case 'GPP': return 'hsl(300, 75%, 45%)';
    case 'TPP': return 'hsl(325, 80%, 45%)';
    default: return 'var(--text-muted)';
  }
}
