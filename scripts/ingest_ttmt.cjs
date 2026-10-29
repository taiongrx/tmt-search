const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const TTMT_FILE = '/Users/Taiongz/Downloads/TMT/MasterTTMT_20261001.xls';
const OUTPUT_JSON = path.join(__dirname, '../public/data/ttmt_drugs.json');
const OUTPUT_SEARCH = path.join(__dirname, '../public/data/search_TTMT.json');

console.log('='.repeat(70));
console.log('🌿 Thai Traditional Medicines Terminology (TTMT) Ingestion Engine');
console.log('📁 Reading:', TTMT_FILE);
console.log('='.repeat(70));

if (!fs.existsSync(TTMT_FILE)) {
  console.error('❌ TTMT File not found:', TTMT_FILE);
  process.exit(1);
}

const wb = XLSX.readFile(TTMT_FILE);
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet);

console.log(`✅ Loaded ${rows.length.toLocaleString()} raw TTMT records.`);

const ttmtMap = {};
const searchList = [];

for (const r of rows) {
  const code = String(r.TTMTCode || '').trim();
  if (!code) continue;

  const item = {
    id: code,
    type: 'TTMT',
    activeIngredient: String(r.ActiveIngredient || '').trim(),
    strength: String(r.Strength || '').trim(),
    dosageForm: String(r.Dosageform || '').trim(),
    dispUnit: String(r.DispUnit || '').trim(),
    tradeName: String(r.TradeName || '').trim(),
    mfr: String(r.Manufacturer || '').trim(),
    fsn: String(r.FSN || '').trim(),
    status: String(r.Status || 'Active').trim(),
    ttmtType: String(r.TTMTType || '').trim(),
    ed: String(r.ED || '').trim(),
    drugGroupNhso: String(r.Drug_Group_Nhso || '').trim()
  };

  ttmtMap[code] = item;
  searchList.push({
    id: code,
    fsn: item.fsn,
    tradeName: item.tradeName,
    mfr: item.mfr,
    ingredient: item.activeIngredient
  });
}

fs.writeFileSync(OUTPUT_JSON, JSON.stringify(ttmtMap, null, 2));
fs.writeFileSync(OUTPUT_SEARCH, JSON.stringify(searchList, null, 2));

console.log(`💾 Saved ${Object.keys(ttmtMap).length.toLocaleString()} TTMT items to public/data/ttmt_drugs.json`);
console.log(`💾 Saved ${searchList.length.toLocaleString()} search entries to public/data/search_TTMT.json`);
console.log('='.repeat(70));
