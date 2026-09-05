const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

// 1. Determine Source Directory (CLI argument or Auto-detect latest in Downloads)
const DOWNLOADS_DIR = '/Users/Taiongz/Downloads';
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'data');

function getTargetReleaseDir() {
  // If provided as CLI argument: e.g. "node processData.cjs 20260817" or full path
  if (process.argv[2]) {
    const arg = process.argv[2];
    if (fs.existsSync(arg)) return arg;
    const testPath = path.join(DOWNLOADS_DIR, arg.startsWith('TMTRF') ? arg : `TMTRF${arg}`);
    if (fs.existsSync(testPath)) return testPath;
  }

  // Auto-detect all TMTRF folders in Downloads and pick latest by date
  try {
    const entries = fs.readdirSync(DOWNLOADS_DIR, { withFileTypes: true });
    const releaseDirs = entries
      .filter(e => e.isDirectory() && e.name.startsWith('TMTRF'))
      .map(e => e.name)
      .sort((a, b) => b.localeCompare(a)); // Sort descending by date

    if (releaseDirs.length > 0) {
      console.log(`[Auto-Detect] Found available releases: ${releaseDirs.join(', ')}`);
      console.log(`[Auto-Detect] Selecting latest release: ${releaseDirs[0]}`);
      return path.join(DOWNLOADS_DIR, releaseDirs[0]);
    }
  } catch (err) {
    console.error('Error scanning Downloads directory:', err);
  }

  // Fallback default
  return path.join(DOWNLOADS_DIR, 'TMTRF20260817');
}

const SOURCE_DIR = getTargetReleaseDir();
const releaseName = path.basename(SOURCE_DIR);
const dateMatch = releaseName.match(/\d{8}/);
const releaseDateStr = dateMatch ? dateMatch[0] : '20260817';

console.log('='.repeat(75));
console.log(`🚀 TMT Data Compilation Engine (Dynamic Release Pipeline)`);
console.log(`📁 Source Folder: ${SOURCE_DIR}`);
console.log(`🏷️  Release Version: ${releaseName}`);
console.log('='.repeat(75));

// Ensure output dir exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Locate BONUS or subfolder containing Concept & Relationship
function findSubfolder(base, targetSubname) {
  if (fs.existsSync(path.join(base, targetSubname))) return path.join(base, targetSubname);
  const bonusName = `${releaseName}_BONUS`;
  if (fs.existsSync(path.join(base, bonusName, targetSubname))) return path.join(base, bonusName, targetSubname);
  return null;
}

const conceptDir = findSubfolder(SOURCE_DIR, 'Concept');
const relationDir = findSubfolder(SOURCE_DIR, 'Relationship');

if (!conceptDir || !relationDir) {
  console.error(`❌ Error: Could not find Concept or Relationship directory in ${SOURCE_DIR}`);
  process.exit(1);
}

console.log(`✅ Located Concept directory: ${conceptDir}`);
console.log(`✅ Located Relationship directory: ${relationDir}`);

const conceptsByType = {
  SUBS: {},
  VTM: {},
  GP: {},
  TP: {},
  GPU: {},
  TPU: {},
  GPP: {},
  TPP: {}
};

const relations = {};

function addConcept(id, type, fsn, mfr, changedate) {
  if (!id) return;
  const strId = String(id).trim();
  if (!conceptsByType[type]) conceptsByType[type] = {};
  conceptsByType[type][strId] = {
    id: strId,
    type,
    fsn: fsn ? String(fsn).trim() : '',
    mfr: mfr ? String(mfr).trim() : undefined,
    date: changedate ? String(changedate).trim() : undefined
  };
}

function addRelation(id1, id2, type1, type2) {
  if (!id1 || !id2) return;
  const strId1 = String(id1).trim();
  const strId2 = String(id2).trim();

  if (!relations[strId1]) relations[strId1] = { parents: [], children: [] };
  if (!relations[strId2]) relations[strId2] = { parents: [], children: [] };

  const levels = {
    'SUBS': 1, 'VTM': 2, 'GP': 3, 'TP': 4, 'GPU': 4, 'TPU': 5, 'GPP': 5, 'TPP': 6
  };

  const lvl1 = levels[type1] || 0;
  const lvl2 = levels[type2] || 0;

  if (lvl1 < lvl2) {
    if (!relations[strId1].children.some(c => c.id === strId2)) {
      relations[strId1].children.push({ id: strId2, type: type2 });
    }
    if (!relations[strId2].parents.some(p => p.id === strId1)) {
      relations[strId2].parents.push({ id: strId1, type: type1 });
    }
  } else {
    if (!relations[strId2].children.some(c => c.id === strId1)) {
      relations[strId2].children.push({ id: strId1, type: type1 });
    }
    if (!relations[strId1].parents.some(p => p.id === strId2)) {
      relations[strId1].parents.push({ id: strId2, type: type2 });
    }
  }
}

// 1. Process Concept Files dynamically by matching prefix
const conceptTypes = ['SUBS', 'VTM', 'GP', 'TP', 'GPU', 'TPU', 'GPP', 'TPP'];
const conceptFiles = fs.readdirSync(conceptDir);

conceptTypes.forEach(type => {
  const matchFile = conceptFiles.find(f => f.toUpperCase().startsWith(type) && f.endsWith('.xls'));
  if (!matchFile) {
    console.log(`⚠️ Concept file not found for ${type}`);
    return;
  }
  const filePath = path.join(conceptDir, matchFile);
  console.log(`Reading concept file: ${matchFile}...`);
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);

  rows.forEach(row => {
    const id = row[`TMTID(${type})`] || row['TMTID'] || row['ID'];
    const fsn = row['FSN'];
    const mfr = row['MANUFACTURER'];
    const date = row['CHANGEDATE'];
    addConcept(id, type, fsn, mfr, date);
  });
});

// 2. Process Relationship Files dynamically
const relMappingRules = [
  { prefix: 'SUBStoVTM', t1: 'SUBS', t2: 'VTM', k1: 'SUBSID', k2: 'VTMID' },
  { prefix: 'VTMtoGP', t1: 'VTM', t2: 'GP', k1: 'VTMID', k2: 'GPID' },
  { prefix: 'GPtoGPU', t1: 'GP', t2: 'GPU', k1: 'GPID', k2: 'GPUID' },
  { prefix: 'GPUtoTPU', t1: 'GPU', t2: 'TPU', k1: 'GPUID', k2: 'TPUID' },
  { prefix: 'GPtoTP', t1: 'GP', t2: 'TP', k1: 'GPID', k2: 'TPID' },
  { prefix: 'TPtoTPU', t1: 'TP', t2: 'TPU', k1: 'TPID', k2: 'TPUID' },
  { prefix: 'GPUtoGPP', t1: 'GPU', t2: 'GPP', k1: 'GPUID', k2: 'GPPID' },
  { prefix: 'TPUtoTPP', t1: 'TPU', t2: 'TPP', k1: 'TPUID', k2: 'TPPID' },
  { prefix: 'GPPtoTPP', t1: 'GPP', t2: 'TPP', k1: 'GPPID', k2: 'TPPID' },
  { prefix: 'TPPtoTPP', t1: 'TPP', t2: 'TPP', k1: 'TPPID1', k2: 'TPPID2' },
  { prefix: 'GPPtoGPP', t1: 'GPP', t2: 'GPP', k1: 'GPPID1', k2: 'GPPID2' },
];

const relFiles = fs.readdirSync(relationDir);

relMappingRules.forEach(rule => {
  const matchFile = relFiles.find(f => f.startsWith(rule.prefix) && f.endsWith('.xls'));
  if (!matchFile) {
    console.log(`⚠️ Relationship file not found for ${rule.prefix}`);
    return;
  }
  const filePath = path.join(relationDir, matchFile);
  console.log(`Reading relationship file: ${matchFile}...`);
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);

  rows.forEach(row => {
    addRelation(row[rule.k1], row[rule.k2], rule.t1, rule.t2);
  });
});

// 3. Process MasterTMT file for detailed TPU attributes
const bonusDir = path.dirname(conceptDir);
const bonusFiles = fs.readdirSync(bonusDir);
const masterFileName = bonusFiles.find(f => f.startsWith('MasterTMT_') && f.endsWith('.xls'));

if (masterFileName) {
  const masterFilePath = path.join(bonusDir, masterFileName);
  console.log(`Reading MasterTMT file: ${masterFileName}...`);
  const workbook = XLSX.readFile(masterFilePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);

  rows.forEach(row => {
    const tpuCode = String(row['TPUCode']).trim();
    const tpuObj = conceptsByType['TPU'][tpuCode];
    if (tpuObj) {
      tpuObj.strength = row['Strength'] ? String(row['Strength']).trim() : undefined;
      tpuObj.dosageForm = row['Dosageform'] ? String(row['Dosageform']).trim() : undefined;
      tpuObj.contValue = row['Contvalue'] ? String(row['Contvalue']).trim() : undefined;
      tpuObj.contUnit = row['Contunit'] ? String(row['Contunit']).trim() : undefined;
      tpuObj.dispUnit = row['DispUnit'] ? String(row['DispUnit']).trim() : undefined;
      tpuObj.tradeName = row['TradeName'] ? String(row['TradeName']).trim() : undefined;
      tpuObj.activeIngredient = row['ActiveIngredient'] ? String(row['ActiveIngredient']).trim() : undefined;
      tpuObj.statusLabel = row['Status'] ? String(row['Status']).trim() : undefined;
    }
  });
}

// 4. Save Partitioned JSON files
let totalConcepts = 0;
for (const type of Object.keys(conceptsByType)) {
  const list = conceptsByType[type];
  const count = Object.keys(list).length;
  totalConcepts += count;
  console.log(`Writing concepts_${type}.json (${count} items)...`);
  fs.writeFileSync(path.join(OUTPUT_DIR, `concepts_${type}.json`), JSON.stringify(list));

  const searchIndex = Object.values(list).map(c => ({
    id: c.id,
    fsn: c.fsn,
    mfr: c.mfr,
    tradeName: c.tradeName
  }));
  console.log(`Writing search_${type}.json (${count} items)...`);
  fs.writeFileSync(path.join(OUTPUT_DIR, `search_${type}.json`), JSON.stringify(searchIndex));
}

// Convert YYYYMMDD to Thai Date Text
function formatThaiDate(dateStr) {
  if (!dateStr || dateStr.length !== 8) return dateStr;
  const y = parseInt(dateStr.substring(0, 4), 10);
  const m = parseInt(dateStr.substring(4, 6), 10);
  const d = parseInt(dateStr.substring(6, 8), 10);
  const thaiMonths = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
  ];
  return `${d} ${thaiMonths[m - 1]} ${y}`;
}

const metaInfo = {
  version: releaseName,
  releaseDate: formatThaiDate(releaseDateStr),
  conceptCounts: {},
  totalConcepts,
  totalRelations: Object.keys(relations).length
};
for (const type of Object.keys(conceptsByType)) {
  metaInfo.conceptCounts[type] = Object.keys(conceptsByType[type]).length;
}
fs.writeFileSync(path.join(OUTPUT_DIR, 'meta.json'), JSON.stringify(metaInfo));

console.log('Writing relations.json...');
fs.writeFileSync(path.join(OUTPUT_DIR, 'relations.json'), JSON.stringify(relations));

console.log('='.repeat(75));
console.log(`🎉 Compilation of ${releaseName} finished successfully!`);
console.log(`Total concepts loaded: ${totalConcepts.toLocaleString()}`);
console.log(`Total relations loaded: ${Object.keys(relations).length.toLocaleString()}`);
console.log(`Release Date: ${metaInfo.releaseDate}`);
console.log(`Output files written to: ${OUTPUT_DIR}`);
console.log('='.repeat(75));
