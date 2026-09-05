import React, { useState, useEffect } from 'react';
import { Search, ArrowRight, HelpCircle, Trash2, Plus } from 'lucide-react';
import type { ConceptType, Concept, SearchItem, RelationsMap, RelationNode } from '../types/tmt';

// Pre-populated real TMT Substance IDs and their standard WHO ATC Codes
const INITIAL_ATC_MAP: Record<string, { atc: string; name: string }> = {
  '225929': { atc: 'B01AA03', name: 'Warfarin' },
  '223251': { atc: 'C08CA01', name: 'Amlodipine' },
  '223267': { atc: 'C08CA01', name: 'Amlodipine besilate' },
  '696815': { atc: 'A10BA02', name: 'Metformin hydrochloride' },
  '224764': { atc: 'C09CA01', name: 'Losartan potassium' },
  '223312': { atc: 'C10AA05', name: 'Atorvastatin' },
  '223320': { atc: 'C10AA05', name: 'Atorvastatin calcium' },
  '233364': { atc: 'C03DA01', name: 'Spironolactone' },
  '224391': { atc: 'M01AE01', name: 'Ibuprofen' },
  '665824': { atc: 'N02BE01', name: 'Paracetamol' },
  '226449': { atc: 'J01CA04', name: 'Amoxicillin' },
  '872618': { atc: 'J05AB01', name: 'Aciclovir' },
  // Adding VTM mappings for completeness
  '223088': { atc: 'B01AA03', name: 'Warfarin sodium (VTM)' },
  '220457': { atc: 'C08CA01', name: 'Amlodipine (VTM)' },
  '696836': { atc: 'A10BA02', name: 'Metformin hydrochloride (VTM)' },
  '958329': { atc: 'C09CA01', name: 'Losartan potassium (VTM)' },
  '693906': { atc: 'C10AA05', name: 'Atorvastatin (VTM)' },
  '233386': { atc: 'C03DA01', name: 'Spironolactone (VTM)' },
  '221671': { atc: 'M01AE01', name: 'Ibuprofen (VTM)' },
  '747121': { atc: 'N02BE01', name: 'Paracetamol (VTM)' },
  '226465': { atc: 'J01CA04', name: 'Amoxicillin (VTM)' },
  '229101': { atc: 'J01CR02', name: 'Amoxicillin + clavulanic acid (VTM)' },
  '872639': { atc: 'J05AB01', name: 'Aciclovir (VTM)' }
};

// Module-level caches to prevent duplicate concurrent network fetches
const fetchPromises: Record<string, Promise<Record<string, Concept>> | null> = {};
const loadedConcepts: Record<string, Record<string, Concept>> = {};

export const CodeTranslator: React.FC = () => {
  const [sourceType, setSourceType] = useState<ConceptType | 'ATC'>('GPU');
  const [targetType, setTargetType] = useState<ConceptType | 'ATC'>('ATC');
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<SearchItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<SearchItem | null>(null);
  
  // Data caches
  const [searchIndex, setSearchIndex] = useState<SearchItem[]>([]);
  const [relations, setRelations] = useState<RelationsMap | null>(null);
  const [conceptsCache, setConceptsCache] = useState<Record<string, Record<string, Concept>>>({});
  
  // Custom ATC mapping state (loaded from JSON + localStorage)
  const [atcMap, setAtcMap] = useState<Record<string, { atc: string; name: string }>>(INITIAL_ATC_MAP);
  const [showAtcManager, setShowAtcManager] = useState(false);
  const [newTmtId, setNewTmtId] = useState('');
  const [newAtcCode, setNewAtcCode] = useState('');
  const [newDrugName, setNewDrugName] = useState('');

  // Results State
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<{
    targetConcept: Concept | { id: string; type: 'ATC'; fsn: string };
    path: { id: string; type: string; fsn: string }[];
  }[]>([]);

  // Load comprehensive ATC mappings and local storage on mount
  useEffect(() => {
    fetch('/data/atc_mappings.json')
      .then(res => {
        if (!res.ok) throw new Error('atc_mappings.json not found');
        return res.json();
      })
      .then((data: Record<string, { atc: string; name: string }>) => {
        const saved = localStorage.getItem('tmt_atc_mappings');
        const custom = saved ? JSON.parse(saved) : {};
        setAtcMap({ ...INITIAL_ATC_MAP, ...data, ...custom });
      })
      .catch(err => {
        console.warn('Could not load atc_mappings.json, falling back to local storage:', err);
        const saved = localStorage.getItem('tmt_atc_mappings');
        if (saved) {
          setAtcMap({ ...INITIAL_ATC_MAP, ...JSON.parse(saved) });
        }
      });
  }, []);

  // Load search index for the selected source type
  useEffect(() => {
    setSelectedItem(null);
    setSearchQuery('');
    setSuggestions([]);
    setResults([]);

    if (sourceType === 'ATC') {
      // Build search index from our active ATC mapping list
      const atcItems = Object.entries(atcMap).map(([tmtid, val]) => ({
        id: val.atc,
        fsn: `${val.atc} - ${val.name} (TMT Link: ${tmtid})`,
        tradeName: val.name
      }));
      // Remove duplicates
      const uniqueAtc = Array.from(new Map(atcItems.map(item => [item.id, item])).values());
      setSearchIndex(uniqueAtc);
      return;
    }

    fetch(`/data/search_${sourceType}.json`)
      .then(res => res.json())
      .then(data => setSearchIndex(data))
      .catch(err => console.error(`Error loading search_${sourceType}:`, err));
  }, [sourceType, atcMap]);

  // Load relationships graph
  useEffect(() => {
    fetch('/data/relations.json')
      .then(res => res.json())
      .then(data => setRelations(data))
      .catch(err => console.error('Error loading relations.json:', err));
  }, []);

  // Auto re-translate whenever targetType changes if an item is already selected
  useEffect(() => {
    if (selectedItem && relations) {
      handleTranslate(selectedItem);
    }
  }, [targetType]);

  // Handle autocomplete input
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    
    if (value.trim().length === 0) {
      setSuggestions([]);
      return;
    }

    const valLower = value.toLowerCase();
    const filtered = searchIndex
      .filter(item => 
        item.id.toLowerCase().includes(valLower) || 
        item.fsn.toLowerCase().includes(valLower) ||
        (item.tradeName && item.tradeName.toLowerCase().includes(valLower)) ||
        (item.mfr && item.mfr.toLowerCase().includes(valLower))
      )
      .slice(0, 10);
    setSuggestions(filtered);
  };

  // Helper to fetch details of a concept from cache or file
  const fetchConceptDetail = async (id: string, type: ConceptType): Promise<Concept | null> => {
    // Check React state cache first
    if (conceptsCache[type] && conceptsCache[type][id]) {
      return conceptsCache[type][id];
    }

    // Check synchronous in-memory module cache
    if (loadedConcepts[type] && loadedConcepts[type][id]) {
      return loadedConcepts[type][id] || null;
    }

    // Check if there is an active fetch for this type
    if (!fetchPromises[type]) {
      fetchPromises[type] = fetch(`/data/concepts_${type}.json`)
        .then(res => res.json())
        .then(data => {
          loadedConcepts[type] = data;
          // Synchronize with React state
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
      console.error(`Error loading concepts_${type}:`, e);
      return null;
    }
  };

  // Helper to perform BFS pathfinding between TMT concepts with accurate node types
  const findTmtPaths = (
    startId: string, 
    startType: ConceptType, 
    targetLevel: ConceptType
  ): { id: string; type: ConceptType }[][] => {
    if (!relations) return [];
    
    const levels: Record<string, number> = {
      'SUBS': 1, 'VTM': 2, 'GP': 3, 'TP': 4, 'GPU': 4, 'TPU': 5, 'GPP': 5, 'TPP': 6
    };

    const targetLvl = levels[targetLevel] || 0;
    const sourceLvl = levels[startType] || 0;

    const queue: { id: string; type: ConceptType; path: { id: string; type: ConceptType }[] }[] = [];
    queue.push({ id: startId, type: startType, path: [{ id: startId, type: startType }] });
    
    const visited = new Set<string>();
    visited.add(startId);
    
    const matchedPaths: { id: string; type: ConceptType }[][] = [];
    
    while (queue.length > 0) {
      const { id, type, path } = queue.shift()!;
      
      // Safety limits
      if (path.length > 8) continue;
      if (matchedPaths.length >= 40) break;
      if (visited.size > 10000) break;

      if (type === targetLevel && id !== startId) {
        matchedPaths.push(path);
        continue;
      }

      const nodeRel = relations[id];
      if (!nodeRel) continue;

      let neighbors: RelationNode[] = [];
      if (targetLvl < sourceLvl) {
        // Going UP: follow parents
        neighbors = nodeRel.parents || [];
      } else if (targetLvl > sourceLvl) {
        // Going DOWN: follow children
        neighbors = nodeRel.children || [];
      } else {
        // Sideways or same level: follow both
        neighbors = [...(nodeRel.parents || []), ...(nodeRel.children || [])];
      }

      for (const next of neighbors) {
        if (!visited.has(next.id)) {
          visited.add(next.id);
          queue.push({
            id: next.id,
            type: next.type,
            path: [...path, { id: next.id, type: next.type }]
          });
        }
      }
    }
    
    return matchedPaths;
  };

  // Main Translate Action
  const handleTranslate = async (item: SearchItem) => {
    if (!relations) return;
    setLoading(true);
    setResults([]);

    const translatedResults: typeof results = [];

    // CASE 1: Translating from TMT to TMT
    if (sourceType !== 'ATC' && targetType !== 'ATC') {
      const paths = findTmtPaths(item.id, sourceType as ConceptType, targetType);
      
      for (const p of paths) {
        const destNode = p[p.length - 1];
        const targetConcept = await fetchConceptDetail(destNode.id, targetType);
        
        if (targetConcept) {
          const resolvedPath: typeof results[0]['path'] = [];
          for (const node of p) {
            const detail = await fetchConceptDetail(node.id, node.type);
            resolvedPath.push({
              id: node.id,
              type: node.type,
              fsn: detail ? detail.fsn : 'Unknown'
            });
          }
          
          translatedResults.push({
            targetConcept,
            path: resolvedPath
          });
        }
      }
    }
    // CASE 2: Translating from TMT to ATC
    else if (sourceType !== 'ATC' && targetType === 'ATC') {
      const foundMappings = new Map<string, typeof results[0]>();

      // Direct check if item itself is already SUBS or VTM mapped to ATC
      if (atcMap[item.id]) {
        const mapped = atcMap[item.id];
        foundMappings.set(mapped.atc, {
          targetConcept: { id: mapped.atc, type: 'ATC', fsn: `${mapped.atc} - ${mapped.name}` },
          path: [
            { id: item.id, type: sourceType, fsn: item.fsn },
            { id: mapped.atc, type: 'ATC', fsn: `${mapped.atc} - ${mapped.name}` }
          ]
        });
      }

      // Find ancestor SUBS and VTM concepts connected to this item
      const pathsToSub = findTmtPaths(item.id, sourceType as ConceptType, 'SUBS');
      const pathsToVtm = findTmtPaths(item.id, sourceType as ConceptType, 'VTM');
      const allPaths = [...pathsToSub, ...pathsToVtm];
      
      for (const p of allPaths) {
        const destNode = p[p.length - 1];
        const mappedAtc = atcMap[destNode.id];
        
        if (mappedAtc && !foundMappings.has(mappedAtc.atc)) {
          const resolvedPath: typeof results[0]['path'] = [];
          for (const node of p) {
            const detail = await fetchConceptDetail(node.id, node.type);
            resolvedPath.push({
              id: node.id,
              type: node.type,
              fsn: detail ? detail.fsn : 'Unknown'
            });
          }
          
          resolvedPath.push({
            id: mappedAtc.atc,
            type: 'ATC',
            fsn: `${mappedAtc.atc} - ${mappedAtc.name}`
          });

          foundMappings.set(mappedAtc.atc, {
            targetConcept: { id: mappedAtc.atc, type: 'ATC', fsn: `${mappedAtc.atc} - ${mappedAtc.name}` },
            path: resolvedPath
          });
        }
      }

      translatedResults.push(...Array.from(foundMappings.values()));
    }
    // CASE 3: Translating from ATC to TMT
    else if (sourceType === 'ATC' && targetType !== 'ATC') {
      const atcCode = item.id;
      const mappedTmtIds = Object.keys(atcMap).filter(tmtid => atcMap[tmtid].atc === atcCode);
      
      for (const startTmtId of mappedTmtIds) {
        const startTmtType: ConceptType = relations[startTmtId]?.parents.length === 0 ? 'SUBS' : 'VTM';
        
        // If targetType matches startTmtType, return immediately
        if (targetType === startTmtType) {
          const targetConcept = await fetchConceptDetail(startTmtId, targetType);
          if (targetConcept) {
            translatedResults.push({
              targetConcept,
              path: [
                { id: atcCode, type: 'ATC', fsn: `${atcCode} - ${item.tradeName || item.fsn}` },
                { id: startTmtId, type: startTmtType, fsn: targetConcept.fsn }
              ]
            });
          }
          continue;
        }

        // Traverse from Substance/VTM to requested target level
        const paths = findTmtPaths(startTmtId, startTmtType, targetType);
        
        for (const p of paths) {
          const destNode = p[p.length - 1];
          const targetConcept = await fetchConceptDetail(destNode.id, targetType);
          
          if (targetConcept) {
            const resolvedPath: typeof results[0]['path'] = [];
            resolvedPath.push({
              id: atcCode,
              type: 'ATC',
              fsn: `${atcCode} - ${item.tradeName || item.fsn}`
            });

            for (const node of p) {
              const detail = await fetchConceptDetail(node.id, node.type);
              resolvedPath.push({
                id: node.id,
                type: node.type,
                fsn: detail ? detail.fsn : 'Unknown'
              });
            }
            
            translatedResults.push({
              targetConcept,
              path: resolvedPath
            });
          }
        }
      }
    }

    setResults(translatedResults);
    setLoading(false);
  };

  // Handle Enter keypress in search input
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (suggestions.length > 0) {
        const top = suggestions[0];
        setSelectedItem(top);
        setSearchQuery(top.fsn);
        setSuggestions([]);
        handleTranslate(top);
      } else if (searchQuery.trim().length > 0) {
        const q = searchQuery.trim().toLowerCase();
        const matched = searchIndex.find(s => s.id.toLowerCase() === q || s.fsn.toLowerCase().includes(q));
        if (matched) {
          setSelectedItem(matched);
          setSearchQuery(matched.fsn);
          setSuggestions([]);
          handleTranslate(matched);
        }
      }
    }
  };

  // Add Custom Mapping Handler
  const handleAddMapping = () => {
    if (!newTmtId || !newAtcCode || !newDrugName) return;
    const updated = {
      ...atcMap,
      [newTmtId.trim()]: {
        atc: newAtcCode.trim().toUpperCase(),
        name: newDrugName.trim()
      }
    };
    setAtcMap(updated);
    localStorage.setItem('tmt_atc_mappings', JSON.stringify(updated));
    setNewTmtId('');
    setNewAtcCode('');
    setNewDrugName('');
  };

  // Remove Mapping Handler
  const handleRemoveMapping = (tmtId: string) => {
    const updated = { ...atcMap };
    delete updated[tmtId];
    setAtcMap(updated);
    localStorage.setItem('tmt_atc_mappings', JSON.stringify(updated));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      <div className="header-container">
        <div>
          <h2 className="page-title">
            <ArrowRight className="w-6 h-6 text-primary" /> ตัวแปลงและคำนวณรหัสยา (Code Translator)
          </h2>
          <p className="page-subtitle">
            เลือกประเภทต้นทางและปลายทางที่ต้องการแปลง โดยระบบจะคำนวณสายสัมพันธ์ (Lineage) จากข้อมูล TMT จริงทั้งหมด
          </p>
        </div>
        <button className="btn btn-secondary text-xs" onClick={() => setShowAtcManager(!showAtcManager)}>
          {showAtcManager ? 'กลับไปยังตัวแปลรหัส' : `จัดการแผนผัง TMT-to-ATC (${Object.keys(atcMap).length.toLocaleString()} รายการ)`}
        </button>
      </div>

      {showAtcManager ? (
        /* ATC Mapping Manager Panel */
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <h3 style={{ fontWeight: 700, fontSize: '1.1rem' }}>จัดการตารางจับคู่รหัส TMT กับ ATC Code</h3>
            <p className="text-muted" style={{ fontSize: '0.85rem' }}>
              ระบุความสัมพันธ์จับคู่ระหว่าง TMT ID ของ Substance / VTM เข้ากับรหัสมาตรฐานสากล ATC Code (ข้อมูลจริงจะบันทึกใน Local Storage)
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr) auto', gap: '12px', alignItems: 'end' }}>
            <div>
              <label className="info-label" style={{ marginBottom: '6px' }}>TMT ID (Substance / VTM)</label>
              <input 
                type="text" 
                placeholder="เช่น 226449" 
                className="input-field" 
                value={newTmtId} 
                onChange={e => setNewTmtId(e.target.value)} 
              />
            </div>
            <div>
              <label className="info-label" style={{ marginBottom: '6px' }}>ATC Code</label>
              <input 
                type="text" 
                placeholder="เช่น J01CA04" 
                className="input-field" 
                value={newAtcCode} 
                onChange={e => setNewAtcCode(e.target.value)} 
              />
            </div>
            <div>
              <label className="info-label" style={{ marginBottom: '6px' }}>ชื่อตัวยา (Generic Name)</label>
              <input 
                type="text" 
                placeholder="เช่น Amoxicillin" 
                className="input-field" 
                value={newDrugName} 
                onChange={e => setNewDrugName(e.target.value)} 
              />
            </div>
            <button className="btn btn-primary" onClick={handleAddMapping} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Plus className="w-4 h-4" /> เพิ่มการแมป
            </button>
          </div>

          <div className="table-wrapper" style={{ maxHeight: '400px', overflowY: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>TMT ID</th>
                  <th>ATC Code</th>
                  <th>ชื่อตัวยา</th>
                  <th>ประเภทข้อมูล</th>
                  <th style={{ textAlign: 'center' }}>จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(atcMap).map(([tmtid, val]) => (
                  <tr key={tmtid}>
                    <td className="mono" style={{ fontWeight: 700 }}>{tmtid}</td>
                    <td className="mono"><span className="tag type-GP">{val.atc}</span></td>
                    <td>{val.name}</td>
                    <td>
                      <span className="tag" style={{ background: 'var(--bg-app)', color: 'var(--text-muted)' }}>
                        {INITIAL_ATC_MAP[tmtid] ? 'มาตรฐานโรงพยาบาล' : 'เพิ่มโดยผู้ใช้'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button 
                        onClick={() => handleRemoveMapping(tmtid)} 
                        disabled={!!INITIAL_ATC_MAP[tmtid]}
                        style={{ border: 'none', background: 'transparent', cursor: INITIAL_ATC_MAP[tmtid] ? 'not-allowed' : 'pointer', color: 'hsl(0, 80%, 60%)' }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Code Translator Panel */
        <div className="translator-panel">
          
          {/* Controls Card */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>กำหนดรูปแบบการคำนวณ</h3>
            
            {/* Quick Presets */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button 
                type="button"
                className={`btn ${sourceType === 'GPU' && targetType === 'ATC' ? 'btn-primary' : 'btn-secondary'} text-xs`}
                onClick={() => { setSourceType('GPU'); setTargetType('ATC'); }}
              >
                ⭐ GPU → ATC (มาตรฐานโรงพยาบาล & สปสช.)
              </button>
              <button 
                type="button"
                className={`btn ${sourceType === 'TPU' && targetType === 'GPU' ? 'btn-primary' : 'btn-secondary'} text-xs`}
                onClick={() => { setSourceType('TPU'); setTargetType('GPU'); }}
              >
                TPU → GPU (หายาสามัญเทียบเท่า)
              </button>
              <button 
                type="button"
                className={`btn ${sourceType === 'TPU' && targetType === 'ATC' ? 'btn-primary' : 'btn-secondary'} text-xs`}
                onClick={() => { setSourceType('TPU'); setTargetType('ATC'); }}
              >
                TPU → ATC (แบรนด์สู่สากล)
              </button>
              <button 
                type="button"
                className={`btn ${sourceType === 'ATC' && targetType === 'GPU' ? 'btn-primary' : 'btn-secondary'} text-xs`}
                onClick={() => { setSourceType('ATC'); setTargetType('GPU'); }}
              >
                ATC → GPU (สืบค้นยาสามัญในไทยจาก ATC)
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: '12px' }}>
              <div>
                <label className="info-label" style={{ marginBottom: '6px' }}>ประเภทรหัสต้นทาง</label>
                <select 
                  className="select-field" 
                  value={sourceType} 
                  onChange={e => setSourceType(e.target.value as any)}
                >
                  <option value="SUBS">SUBS (Substance)</option>
                  <option value="VTM">VTM (Virtual Moiety)</option>
                  <option value="GP">GP (Generic Product)</option>
                  <option value="GPU">GPU (Generic Product Use)</option>
                  <option value="GPP">GPP (Generic Product Pack)</option>
                  <option value="TP">TP (Trade Product)</option>
                  <option value="TPU">TPU (Trade Product Use)</option>
                  <option value="TPP">TPP (Trade Product Pack)</option>
                  <option value="ATC">ATC Code</option>
                </select>
              </div>

              <div className="conversion-arrow-wrapper">
                <div className="conversion-arrow">
                  <ArrowRight className="w-5 h-5" />
                </div>
              </div>

              <div>
                <label className="info-label" style={{ marginBottom: '6px' }}>ประเภทรหัสปลายทาง</label>
                <select 
                  className="select-field" 
                  value={targetType} 
                  onChange={e => setTargetType(e.target.value as any)}
                >
                  <option value="ATC">ATC Code</option>
                  <option value="SUBS">SUBS (Substance)</option>
                  <option value="VTM">VTM (Virtual Moiety)</option>
                  <option value="GP">GP (Generic Product)</option>
                  <option value="GPU">GPU (Generic Product Use)</option>
                  <option value="GPP">GPP (Generic Product Pack)</option>
                  <option value="TP">TP (Trade Product)</option>
                  <option value="TPU">TPU (Trade Product Use)</option>
                  <option value="TPP">TPP (Trade Product Pack)</option>
                </select>
              </div>
            </div>

            {/* Input Search Autocomplete */}
            <div className="search-container">
              <label className="info-label" style={{ marginBottom: '6px' }}>ระบุรหัสต้นทาง หรือชื่อยาอ้างอิง</label>
              <div style={{ position: 'relative' }}>
                <Search className="w-4 h-4 text-muted" style={{ position: 'absolute', left: '16px', top: '15px' }} />
                <input 
                  type="text" 
                  placeholder={sourceType === 'ATC' ? "ระบุรหัส ATC เช่น B01AA03, N02BE01..." : "พิมพ์ TMT ID หรือ FSN เช่น 100014, paracetamol..."}
                  className="input-field" 
                  style={{ paddingLeft: '44px' }}
                  value={searchQuery}
                  onChange={handleSearchChange}
                  onKeyDown={handleKeyDown}
                />
              </div>

              {suggestions.length > 0 && (
                <ul className="suggestions-dropdown">
                  {suggestions.map(s => (
                    <li 
                      key={s.id} 
                      className="suggestion-item"
                      onClick={() => {
                        setSelectedItem(s);
                        setSearchQuery(s.fsn);
                        setSuggestions([]);
                        handleTranslate(s);
                      }}
                    >
                      <span>{s.fsn}</span>
                      <span className="item-id">{s.id}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {selectedItem && (
              <div style={{ background: 'var(--primary-light)', padding: '16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                <p className="info-label">ข้อมูลยาต้นทางที่เลือก</p>
                <p style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-main)', marginTop: '4px' }}>{selectedItem.fsn}</p>
                <p className="mono" style={{ fontSize: '0.8rem', color: 'var(--primary)', marginTop: '4px', fontWeight: 700 }}>
                  ID: {selectedItem.id} ({sourceType})
                </p>
              </div>
            )}
          </div>

          {/* Results Card */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '20px', minHeight: '320px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>ผลลัพธ์การแปลงรหัส (Conversion Output)</h3>
            
            {loading && (
              <div className="spinner-wrapper" style={{ marginTop: 'auto', marginBottom: 'auto' }}>
                <div className="spinner"></div>
                <p className="text-muted">กำลังคำนวณการเดินทราเวอร์สสายสัมพันธ์...</p>
              </div>
            )}

            {!loading && results.length === 0 && (
              <div style={{ margin: 'auto', textAlign: 'center', maxWidth: '420px', padding: '24px' }}>
                <HelpCircle className="w-12 h-12" style={{ margin: '0 auto 12px', strokeWidth: 1, color: 'var(--text-muted)' }} />
                {selectedItem ? (
                  <div>
                    <h4 style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-main)', marginBottom: '8px' }}>
                      ไม่พบการเชื่อมโยงไปยังระดับ {targetType}
                    </h4>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '16px' }}>
                      {targetType === 'ATC'
                        ? `ยาตัวนี้ (${selectedItem.id}) ยังไม่มีการระบุรหัสคู่เทียบ WHO-ATC ในฐานข้อมูล คุณสามารถเพิ่มรหัสคู่เทียบได้เอง`
                        : `ไม่พบความสัมพันธ์โดยตรงจาก ${sourceType} ไปยัง ${targetType} สำหรับรายการนี้ในโครงสร้าง TMT`}
                    </p>
                    {targetType === 'ATC' ? (
                      <button className="btn btn-secondary text-xs" onClick={() => setShowAtcManager(true)}>
                        + จัดการจับคู่รหัส ATC สำหรับยานี้
                      </button>
                    ) : (
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                        <button className="btn btn-secondary text-xs" onClick={() => setTargetType('GPU')}>
                          ลองแปลงเป็น GPU
                        </button>
                        <button className="btn btn-secondary text-xs" onClick={() => setTargetType('GP')}>
                          ลองแปลงเป็น GP
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                    กรุณาค้นหาและเลือกยาต้นทาง หรือกด Enter เพื่อดูผลลัพธ์การแปลงรหัส
                  </p>
                )}
              </div>
            )}

            {!loading && results.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {results.map((res, index) => (
                  <div key={index} style={{ borderBottom: index < results.length - 1 ? '1px solid var(--border)' : 'none', paddingBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <span className="tag type-TPU" style={{ backgroundColor: getTagColor(res.targetConcept.type) }}>
                        {res.targetConcept.type}
                      </span>
                      <span className="mono" style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--primary)' }}>
                        {res.targetConcept.id}
                      </span>
                    </div>

                    <p style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '12px' }}>
                      {res.targetConcept.fsn}
                    </p>

                    {/* Show traversed path */}
                    <div className="lineage-path">
                      {res.path.map((node, nIdx) => (
                        <React.Fragment key={nIdx}>
                          <div className="lineage-node" title={node.fsn}>
                            <span className="tag" style={{ padding: '2px 6px', fontSize: '0.65rem', backgroundColor: getTagColor(node.type), color: 'white' }}>
                              {node.type}
                            </span>
                            <span className="node-id">{node.id}</span>
                          </div>
                          {nIdx < res.path.length - 1 && (
                            <div className="lineage-separator">
                              <ArrowRight className="w-3.5 h-3.5" />
                            </div>
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}
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
    case 'ATC': return 'hsl(160, 80%, 43%)';
    default: return 'var(--text-muted)';
  }
}
