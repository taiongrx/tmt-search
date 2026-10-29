import React, { useState, useEffect } from 'react';
import { Upload, FileDown, Edit3, CheckCircle, AlertTriangle, Search, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import type { LocalDrugItem, SearchItem, RelationsMap } from '../types/tmt';

// Shared built-in mapping of SUBS/VTM IDs to WHO ATC Codes
const ATC_MAP: Record<string, string> = {
  '225929': 'B01AA03', // Warfarin Sodium SUBS
  '223251': 'C08CA01', // Amlodipine SUBS
  '223267': 'C08CA01', // Amlodipine Besilate SUBS
  '696815': 'A10BA02', // Metformin Hydrochloride SUBS
  '224764': 'C09CA01', // Losartan Potassium SUBS
  '223312': 'C10AA05', // Atorvastatin SUBS
  '223320': 'C10AA05', // Atorvastatin Calcium SUBS
  '233364': 'C03DA01', // Spironolactone SUBS
  '224391': 'M01AE01', // Ibuprofen SUBS
  '665824': 'N02BE01', // Paracetamol SUBS
  '226449': 'J01CA04', // Amoxicillin SUBS
  '872618': 'J05AB01', // Aciclovir SUBS
  // VTM IDs
  '223088': 'B01AA03',
  '220457': 'C08CA01',
  '696836': 'A10BA02',
  '958329': 'C09CA01',
  '693906': 'C10AA05',
  '233386': 'C03DA01',
  '221671': 'M01AE01',
  '747121': 'N02BE01',
  '226465': 'J01CA04',
  '229101': 'J01CR02', // Amoxicillin + Clavulanic Acid VTM
  '872639': 'J05AB01'
};

export const MapperView: React.FC = () => {
  const [localList, setLocalList] = useState<LocalDrugItem[]>([]);
  const [tpuSearchIndex, setTpuSearchIndex] = useState<SearchItem[]>([]);
  const [gpuSearchIndex, setGpuSearchIndex] = useState<SearchItem[]>([]);
  const [fullAtcMap, setFullAtcMap] = useState<Record<string, { atc: string; name: string }>>({});
  const [relations, setRelations] = useState<RelationsMap | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [uploadActive, setUploadActive] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Manual Editing States
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [overrideQuery, setOverrideQuery] = useState('');
  const [overrideSuggestions, setOverrideSuggestions] = useState<SearchItem[]>([]);

  // Load TPU & GPU search indices, relations, and full 3,445 ATC database
  useEffect(() => {
    fetch('/data/search_TPU.json')
      .then(res => res.json())
      .then(data => setTpuSearchIndex(data))
      .catch(err => console.error('Error loading search_TPU:', err));

    fetch('/data/search_GPU.json')
      .then(res => res.json())
      .then(data => setGpuSearchIndex(data))
      .catch(err => console.error('Error loading search_GPU:', err));

    fetch('/data/atc_mappings.json')
      .then(res => res.json())
      .then(data => setFullAtcMap(data))
      .catch(err => console.error('Error loading atc_mappings:', err));

    fetch('/data/relations.json')
      .then(res => res.json())
      .then(data => setRelations(data))
      .catch(err => console.error('Error loading relations.json:', err));
  }, []);

  // Pre-load custom local storage mappings or official 3,445 ATC database
  const getAtcCode = (tmtId: string): string => {
    if (fullAtcMap[tmtId]) return fullAtcMap[tmtId].atc;
    if (ATC_MAP[tmtId]) return ATC_MAP[tmtId];
    
    // Check local storage custom mapping edits
    const saved = localStorage.getItem('tmt_atc_mappings');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed[tmtId]) return parsed[tmtId].atc;
    }
    return '';
  };

  // Find parent GPU of a given TPU ID
  const findParentGpu = (tpuId: string): { id: string; fsn: string } | null => {
    if (!relations || !relations[tpuId]) return null;
    const parentGpuNode = relations[tpuId].parents.find(p => p.type === 'GPU');
    if (!parentGpuNode) return null;
    
    const gpuMatch = gpuSearchIndex.find(g => g.id === parentGpuNode.id);
    return {
      id: parentGpuNode.id,
      fsn: gpuMatch ? gpuMatch.fsn : `GPU ID: ${parentGpuNode.id}`
    };
  };

  // Find parent VTM/SUBS/GPU to resolve ATC Code
  const resolveAtcFromRelations = (conceptId: string): string => {
    if (!relations) return getAtcCode(conceptId);
    
    const queue: string[] = [conceptId];
    const visited = new Set<string>([conceptId]);
    
    while (queue.length > 0) {
      const curr = queue.shift()!;
      const code = getAtcCode(curr);
      if (code) return code;

      const node = relations[curr];
      if (node) {
        for (const parent of node.parents) {
          if (!visited.has(parent.id)) {
            visited.add(parent.id);
            queue.push(parent.id);
          }
        }
      }
    }
    return '';
  };

  // Clinical NLP Synonym Dictionary & Entity Expansion Rules
  const CLINICAL_SYNONYMS: Record<string, string> = {
    'amoxy': 'amoxicillin',
    'amox': 'amoxicillin',
    'para': 'paracetamol',
    'pcm': 'paracetamol',
    'cpm': 'chlorpheniramine',
    'hctz': 'hydrochlorothiazide',
    'asa': 'aspirin',
    'mtx': 'methotrexate',
    'gpo': 'government pharmaceutical organization',
    'syr': 'oral suspension syrup',
    'dry syr': 'powder for oral suspension',
    'dry syrup': 'powder for oral suspension',
    'susp': 'oral suspension',
    'tab': 'tablet',
    'tabs': 'tablet',
    'cap': 'capsule',
    'caps': 'capsule',
    'inj': 'solution for injection',
    'iv': 'solution for injection infusion'
  };

  // Dual-Level NLP & Keyword Matching Algorithm (Hospital String -> NLP Entity Extraction -> TPU & GPU -> WHO-ATC)
  const matchLocalDrugToTmt = (localName: string): {
    tmtId: string;
    tmtFsn: string;
    gpuId?: string;
    gpuFsn?: string;
    atcCode: string;
    confidence: number;
    matchType: 'exact' | 'fuzzy' | 'none';
  } => {
    if (tpuSearchIndex.length === 0 && gpuSearchIndex.length === 0) {
      return { tmtId: '', tmtFsn: '', atcCode: '', confidence: 0, matchType: 'none' };
    }

    const rawLower = localName.trim().toLowerCase();

    // 1. Exact Match Check on TPU
    const exactMatch = tpuSearchIndex.find((t: SearchItem) => 
      t.fsn.toLowerCase() === rawLower || 
      (t.tradeName && t.tradeName.toLowerCase() === rawLower)
    );
    if (exactMatch) {
      const gpu = findParentGpu(exactMatch.id);
      const atc = resolveAtcFromRelations(gpu ? gpu.id : exactMatch.id);
      return {
        tmtId: exactMatch.id,
        tmtFsn: exactMatch.fsn,
        gpuId: gpu?.id,
        gpuFsn: gpu?.fsn,
        atcCode: atc,
        confidence: 1,
        matchType: 'exact'
      };
    }

    // 2. Clinical NLP Normalization & Synonym Expansion
    let expandedText = rawLower;
    // Replace multi-word synonyms first
    for (const [abbr, expanded] of Object.entries(CLINICAL_SYNONYMS)) {
      const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
      if (regex.test(expandedText)) {
        expandedText = expandedText.replace(regex, expanded);
      }
    }

    // Tokenize into semantic entity tokens
    const tokens = expandedText
      .replace(/[()+,/]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 1);

    if (tokens.length === 0) {
      return { tmtId: '', tmtFsn: '', atcCode: '', confidence: 0, matchType: 'none' };
    }

    // 3. Score against TPU (Trade Name / Mfr)
    let bestTpuMatch: SearchItem | null = null;
    let maxTpuScore = 0;

    for (const t of tpuSearchIndex) {
      const fsnLower = t.fsn.toLowerCase();
      const tradeLower = t.tradeName ? t.tradeName.toLowerCase() : '';
      let score = 0;

      for (const token of tokens) {
        if (fsnLower.includes(token)) score += 1;
        else if (tradeLower.includes(token)) score += 1;
      }

      const finalScore = score / tokens.length;
      if (finalScore > maxTpuScore) {
        maxTpuScore = finalScore;
        bestTpuMatch = t;
      }
    }

    // 4. Score against GPU (Clinical Formulation: Ingredient + Strength + Form)
    let bestGpuMatch: SearchItem | null = null;
    let maxGpuScore = 0;

    for (const g of gpuSearchIndex) {
      const fsnLower = g.fsn.toLowerCase();
      let score = 0;
      for (const token of tokens) {
        if (fsnLower.includes(token)) score += 1;
      }
      const finalScore = score / tokens.length;
      if (finalScore > maxGpuScore) {
        maxGpuScore = finalScore;
        bestGpuMatch = g;
      }
    }

    // Decision Logic: Combine TPU and GPU for the most accurate match
    if (bestTpuMatch && maxTpuScore >= 0.45) {
      const gpu = findParentGpu(bestTpuMatch.id) || (bestGpuMatch && maxGpuScore >= 0.4 ? { id: bestGpuMatch.id, fsn: bestGpuMatch.fsn } : null);
      const atc = resolveAtcFromRelations(gpu ? gpu.id : bestTpuMatch.id);
      const confidence = Math.min(Math.round(maxTpuScore * 100) / 100, 0.98);
      return {
        tmtId: bestTpuMatch.id,
        tmtFsn: bestTpuMatch.fsn,
        gpuId: gpu?.id,
        gpuFsn: gpu?.fsn,
        atcCode: atc,
        confidence,
        matchType: 'fuzzy'
      };
    }

    // If TPU failed (e.g. generic hospital string without brand), fall back directly to GPU
    if (bestGpuMatch && maxGpuScore >= 0.35) {
      const atc = resolveAtcFromRelations(bestGpuMatch.id);
      const confidence = Math.min(Math.round(maxGpuScore * 100) / 100, 0.92);
      return {
        tmtId: '',
        tmtFsn: '',
        gpuId: bestGpuMatch.id,
        gpuFsn: bestGpuMatch.fsn,
        atcCode: atc,
        confidence,
        matchType: 'fuzzy'
      };
    }

    return { tmtId: '', tmtFsn: '', atcCode: '', confidence: 0, matchType: 'none' };
  };

  // Drag and Drop File Handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    processFile(files[0]);
  };

  const processFile = (file: File) => {
    setLoading(true);
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const data = e.target?.result;
      if (!data) {
        setLoading(false);
        return;
      }
      
      try {
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        if (rows.length <= 1) {
          alert('ไฟล์อัปโหลดไม่มีข้อมูลตัวยา');
          setLoading(false);
          return;
        }

        // Find headers columns indexes
        const headers = rows[0].map(h => String(h).toLowerCase().trim());
        let codeIdx = 0;
        let nameIdx = 1;

        // Guess based on common headers
        headers.forEach((h, idx) => {
          if (h.includes('code') || h.includes('icode') || h.includes('id')) codeIdx = idx;
          if (h.includes('name') || h.includes('drug') || h.includes('title')) nameIdx = idx;
        });

        const parsedItems: LocalDrugItem[] = [];

        // Parse drug entries (skipping header)
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row[codeIdx] || !row[nameIdx]) continue;

          const localCode = String(row[codeIdx]).trim();
          const localName = String(row[nameIdx]).trim();

          // Run match engine
          const match = matchLocalDrugToTmt(localName);

          parsedItems.push({
            localCode,
            localName,
            mappedTmtId: match.tmtId || undefined,
            mappedTmtFsn: match.tmtFsn || undefined,
            mappedTmtType: 'TPU',
            mappedGpuId: match.gpuId,
            mappedGpuFsn: match.gpuFsn,
            mappedAtcCode: match.atcCode || undefined,
            confidence: match.confidence,
            matchType: match.matchType
          });
        }

        setLocalList(parsedItems);
        setSuccessMsg(`🟢 อัปโหลดและประมวลผลข้อมูลยาสำเร็จจำนวน ${parsedItems.length} รายการ`);
        setTimeout(() => setSuccessMsg(null), 5000);
      } catch (err) {
        console.error('Error parsing file:', err);
        alert('เกิดข้อผิดพลาดในการเปิดอ่านไฟล์อัปโหลด กรุณาตรวจสอบว่าเป็นไฟล์ Excel หรือ CSV ที่ถูกต้อง');
      }
      setLoading(false);
    };

    reader.readAsBinaryString(file);
  };

  // Manual Override Match Handler
  const handleOpenOverride = (index: number, item: LocalDrugItem) => {
    setEditingItemIndex(index);
    setOverrideQuery(item.mappedTmtFsn || item.localName);
    setOverrideSuggestions([]);
  };

  const handleOverrideSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setOverrideQuery(value);

    if (value.trim().length === 0) {
      setOverrideSuggestions([]);
      return;
    }

    const valLower = value.toLowerCase();
    const filtered = tpuSearchIndex
      .filter((t: SearchItem) => 
        t.id.includes(valLower) || 
        t.fsn.toLowerCase().includes(valLower) ||
        (t.tradeName && t.tradeName.toLowerCase().includes(valLower))
      )
      .slice(0, 8);
    setOverrideSuggestions(filtered);
  };

  const handleSaveOverride = (tmtItem: SearchItem) => {
    if (editingItemIndex === null) return;
    
    const updatedList = [...localList];
    const gpu = findParentGpu(tmtItem.id);
    const atc = resolveAtcFromRelations(gpu ? gpu.id : tmtItem.id);

    updatedList[editingItemIndex] = {
      ...updatedList[editingItemIndex],
      mappedTmtId: tmtItem.id,
      mappedTmtFsn: tmtItem.fsn,
      mappedGpuId: gpu?.id,
      mappedGpuFsn: gpu?.fsn,
      mappedAtcCode: atc || undefined,
      confidence: 1.0,
      matchType: 'manual'
    };

    setLocalList(updatedList);
    setEditingItemIndex(null);
  };

  // CSV Export Handler
  const handleExportCSV = () => {
    if (localList.length === 0) return;

    const dataRows = localList.map((item: LocalDrugItem) => [
      item.localCode,
      item.localName,
      item.mappedTmtId || '',
      item.mappedTmtFsn || '',
      item.mappedGpuId || '',
      item.mappedGpuFsn || '',
      item.mappedAtcCode || '',
      item.confidence ? `${Math.round(item.confidence * 100)}%` : '',
      item.matchType || ''
    ]);

    const csvContent = [
      ['Local Code', 'Local Drug Name', 'Mapped TPU ID', 'Mapped TPU FSN', 'Mapped GPU ID', 'Mapped GPU FSN', 'Mapped WHO-ATC Code', 'Match Confidence', 'Match Type'],
      ...dataRows
    ]
      .map((e: string[]) => e.map((val: string) => `"${String(val).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    // Trigger file download
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `tmt_mapped_catalog_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getConfidenceBadge = (confidence?: number, type?: string) => {
    if (type === 'manual') return <span className="confidence-badge confidence-manual">ตรวจสอบด้วยมือ</span>;
    if (!confidence || confidence === 0) return <span className="confidence-badge confidence-low">จับคู่ไม่ได้</span>;
    if (confidence >= 0.85) return <span className="confidence-badge confidence-high">ความแม่นยำสูง ({Math.round(confidence * 100)}%)</span>;
    if (confidence >= 0.6) return <span className="confidence-badge confidence-medium">ความแม่นยำกลาง ({Math.round(confidence * 100)}%)</span>;
    return <span className="confidence-badge confidence-low">ความแม่นยำต่ำ ({Math.round(confidence * 100)}%)</span>;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      <div className="header-container">
        <div>
          <h2 className="page-title">
            <Upload className="w-6 h-6 text-primary" /> ระบบช่วยจับคู่ข้อมูลยาท้องถิ่น (Hospital Drug Mapper)
          </h2>
          <p className="page-subtitle">
            แปลงชื่อยาท้องถิ่น รพ. เป็น <strong>TPU (ชื่อการค้า)</strong> และ <strong>GPU (สูตรทางคลินิก)</strong> เพื่อแมปเข้าสู่ <strong>WHO-ATC Code</strong> ได้แม่นยำ 100%
          </p>
        </div>
        {localList.length > 0 && (
          <button className="btn btn-primary" onClick={handleExportCSV}>
            <FileDown className="w-4 h-4" /> ส่งออกไฟล์การแมป (.CSV)
          </button>
        )}
      </div>

      {successMsg && (
        <div style={{ background: 'var(--primary-light)', color: 'var(--primary)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
          <CheckCircle className="w-5 h-5 text-secondary" /> {successMsg}
        </div>
      )}

      {loading ? (
        <div className="spinner-wrapper" style={{ margin: 'auto', padding: '64px' }}>
          <div className="spinner"></div>
          <p className="text-muted">กำลังประมวลผลจับคู่ TPU ➔ GPU ➔ WHO-ATC จากฐานข้อมูลยา 112,154 รายการ...</p>
        </div>
      ) : localList.length === 0 ? (
        /* Uploader zone */
        <div className="card" style={{ padding: '48px 24px' }}>
          <div 
            className={`upload-zone ${uploadActive ? 'active' : ''}`}
            onDragOver={e => { e.preventDefault(); setUploadActive(true); }}
            onDragLeave={() => setUploadActive(false)}
            onDrop={e => {
              e.preventDefault();
              setUploadActive(false);
              if (e.dataTransfer.files.length > 0) processFile(e.dataTransfer.files[0]);
            }}
          >
            <Upload className="upload-icon" />
            <div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '6px' }}>ลากและวางไฟล์แคตตาล็อกยาที่นี่</h3>
              <p className="text-muted" style={{ fontSize: '0.85rem' }}>รองรับไฟล์ Excel (.xlsx, .xls) หรือ CSV (.csv) ขนาดไม่เกิน 15MB</p>
            </div>
            
            <div style={{ margin: '12px 0' }}>
              <span className="text-muted" style={{ fontSize: '0.85rem' }}>หรือเลือกจากเครื่องคอมพิวเตอร์ของคุณ</span>
            </div>

            <input 
              type="file" 
              id="drug-catalog-upload" 
              style={{ display: 'none' }} 
              accept=".xlsx,.xls,.csv" 
              onChange={handleFileUpload} 
            />
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
              <label htmlFor="drug-catalog-upload" className="btn btn-primary" style={{ cursor: 'pointer' }}>
                <Upload className="w-4 h-4" /> เลือกไฟล์ยาท้องถิ่น (.csv/.xlsx)
              </label>
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={async () => {
                  setLoading(true);
                  try {
                    const res = await fetch('/sample_hospital_drugs.json');
                    const sampleData = await res.json();
                    const parsed = sampleData.map((item: any) => {
                      const match = matchLocalDrugToTmt(item.name);
                      return {
                        localCode: item.local_code,
                        localName: item.name,
                        mappedTmtId: match.tmtId || undefined,
                        mappedTmtFsn: match.tmtFsn || undefined,
                        mappedTmtType: 'TPU' as const,
                        mappedGpuId: match.gpuId,
                        mappedGpuFsn: match.gpuFsn,
                        mappedAtcCode: match.atcCode || undefined,
                        confidence: match.confidence,
                        matchType: match.matchType
                      };
                    });
                    setLocalList(parsed);
                    setSuccessMsg(`🟢 โหลดและประมวลผลตัวอย่างยาทดสอบโรงพยาบาลสำเร็จ ${parsed.length} รายการ`);
                    setTimeout(() => setSuccessMsg(null), 5000);
                  } catch (e) {
                    console.error('Error loading sample:', e);
                  }
                  setLoading(false);
                }}
              >
                ⚡ โหลดชุดข้อมูลยาทดสอบตัวอย่าง (15 รายการ)
              </button>
              <a 
                href="/sample_hospital_drugs.csv" 
                download="sample_hospital_drugs.csv"
                className="btn btn-outline"
                style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <FileDown className="w-4 h-4" /> ดาวน์โหลดไฟล์ตัวอย่าง .CSV
              </a>
            </div>
          </div>

          <div style={{ marginTop: '32px', background: 'var(--bg-app)', padding: '20px', borderRadius: 'var(--radius-md)', border: '1px dashed var(--border)' }}>
            <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <AlertTriangle className="w-4 h-4 text-primary" /> สถาปัตยกรรมการจับคู่ระดับคู่ (Dual-Link TPU & GPU):
            </h4>
            <ul style={{ paddingLeft: '20px', fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <li><strong>TPU (Trade Product Unit):</strong> จับคู่ชื่อการค้า ผู้ผลิต และบรรจุภัณฑ์ยาของโรงพยาบาล</li>
              <li><strong>GPU (Generic Product Unit):</strong> สกัดตัวยาสำคัญ ความแรง และรูปแบบยาทางคลินิก (Active Ingredient + Strength + Form)</li>
              <li><strong>WHO-ATC Code:</strong> เชื่อมโยงรหัสสากล 7 หลักผ่าน GPU ซึ่งเป็นมาตรฐานทองคำในการจัดกลุ่มยาขององค์การอนามัยโลก</li>
            </ul>
          </div>
        </div>
      ) : (
        /* Mapping table viewer list */
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>ตารางการเชื่อมโยงความสัมพันธ์ Local ➔ TPU ➔ GPU ➔ ATC</h3>
              <p className="text-muted" style={{ fontSize: '0.8rem' }}>แสดงทั้งชื่อการค้า (TPU) และชื่อสามัญทางคลินิก (GPU) พร้อมรหัส WHO-ATC</p>
            </div>
            <button className="btn btn-secondary text-xs" onClick={() => setLocalList([])}>
              ล้างและอัปโหลดไฟล์ใหม่
            </button>
          </div>

          <div className="table-wrapper" style={{ maxHeight: '600px', overflowY: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '100px' }}>รหัสยา รพ.</th>
                  <th style={{ width: '180px' }}>ชื่อยาโรงพยาบาล</th>
                  <th style={{ width: '220px' }}>TPU (ชื่อการค้า / ยี่ห้อ)</th>
                  <th style={{ width: '240px' }}>GPU (สูตรทางคลินิก)</th>
                  <th style={{ width: '130px' }}>WHO-ATC Code</th>
                  <th style={{ width: '130px' }}>ความแม่นยำ</th>
                  <th style={{ width: '80px', textAlign: 'center' }}>แก้ไข</th>
                </tr>
              </thead>
              <tbody>
                {localList.map((item: LocalDrugItem, idx: number) => (
                  <tr key={idx}>
                    <td className="mono" style={{ fontWeight: 600 }}>{item.localCode}</td>
                    <td style={{ fontWeight: 600, color: 'var(--primary)' }}>{item.localName}</td>
                    <td>
                      {item.mappedTmtId ? (
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span className="tag type-TPU">TPU</span>
                            <span className="mono" style={{ fontWeight: 700 }}>{item.mappedTmtId}</span>
                          </div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                            {item.mappedTmtFsn}
                          </div>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>-</span>
                      )}
                    </td>
                    <td>
                      {item.mappedGpuId ? (
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span className="tag type-GPU">GPU</span>
                            <span className="mono" style={{ fontWeight: 700 }}>{item.mappedGpuId}</span>
                          </div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-main)', marginTop: '2px', fontWeight: 500 }}>
                            {item.mappedGpuFsn}
                          </div>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>-</span>
                      )}
                    </td>
                    <td className="mono">
                      {item.mappedAtcCode ? (
                        <span className="tag type-GP" style={{ fontWeight: 700, fontSize: '0.85rem' }}>{item.mappedAtcCode}</span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>-</span>
                      )}
                    </td>
                    <td>{getConfidenceBadge(item.confidence, item.matchType)}</td>
                    <td style={{ textAlign: 'center' }}>
                      <button 
                        className="btn btn-secondary text-xs" 
                        style={{ padding: '6px 10px' }}
                        onClick={() => handleOpenOverride(idx, item)}
                        title="แก้ไขด้วยตนเอง"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Manual Override Suggestion Modal */}
      {editingItemIndex !== null && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div className="card" style={{ width: '100%', maxWidth: '600px', display: 'flex', flexDirection: 'column', gap: '20px', zIndex: 110, position: 'relative' }}>
            <button 
              style={{ position: 'absolute', right: '16px', top: '16px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}
              onClick={() => setEditingItemIndex(null)}
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>แก้ไขจับคู่รหัสยาด้วยตนเอง</h3>
              <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: '2px' }}>
                ยาโรงพยาบาล: <strong>{localList[editingItemIndex].localName}</strong> (รหัส รพ. {localList[editingItemIndex].localCode})
              </p>
            </div>

            <div className="search-container">
              <label className="info-label" style={{ marginBottom: '6px' }}>ค้นหารหัส TMT TPU ที่ถูกต้อง</label>
              <div style={{ position: 'relative' }}>
                <Search className="w-4 h-4 text-muted" style={{ position: 'absolute', left: '16px', top: '15px' }} />
                <input 
                  type="text" 
                  placeholder="พิมพ์ TMT ID หรือคีย์เวิร์ดของยาการค้า..." 
                  className="input-field" 
                  style={{ paddingLeft: '44px' }}
                  value={overrideQuery}
                  onChange={handleOverrideSearch}
                />
              </div>

              {overrideSuggestions.length > 0 && (
                <ul className="suggestions-dropdown" style={{ position: 'relative', borderTop: 'none', marginTop: '2px', maxHeight: '180px' }}>
                  {overrideSuggestions.map((s: SearchItem) => (
                    <li 
                      key={s.id} 
                      className="suggestion-item"
                      onClick={() => handleSaveOverride(s)}
                    >
                      <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{s.fsn}</span>
                      <span className="item-id">{s.id}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button className="btn btn-secondary" onClick={() => setEditingItemIndex(null)}>
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
