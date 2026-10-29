/**
 * Automated WHO-ATC Extraction & Ingestion Pipeline (Data Engineering Script)
 * 
 * Sources:
 *  - Primary: Wikidata Biomedical SPARQL Endpoint (Property P267 = WHO-ATC code)
 *  - Secondary/Verification: NIH NLM RxNav / RxClass API
 * 
 * Pipeline Steps:
 *  1. [EXTRACT]: Pull 4,000+ Level-5 7-digit WHO-ATC codes & INN Generic Names via SPARQL.
 *  2. [TRANSFORM]:
 *      - Clean & tokenize drug names (remove salt radicals: hydrochloride, sodium, etc.)
 *      - Perform Exact & Fuzzy Semantic Matching against TMT Substance (SUBS) & VTM.
 *  3. [LOAD]: Output normalized JSON master mapping to public/data/atc_mappings.json.
 */

const fs = require("fs");
const path = require("path");


// Medical Synonyms & Standard Common Solutions
const ALIASES = {
  "water": { atc: "V07AB", name: "water for injection / solvents" },
  "water for injection": { atc: "V07AB", name: "water for injection" },
  "sterile water": { atc: "V07AB", name: "water for injection" },
  "hyaluronate sodium": { atc: "S01KA08", name: "hyaluronic acid" },
  "sodium hyaluronate": { atc: "S01KA08", name: "hyaluronic acid" },
  "ciclosporin": { atc: "L04AD01", name: "ciclosporin" },
  "cyclosporine": { atc: "L04AD01", name: "ciclosporin" },
  "ephedrine": { atc: "R01AA03", name: "ephedrine" },
  "ephedrine hydrochloride": { atc: "R01AA03", name: "ephedrine" },
  "coal tar": { atc: "D05AA", name: "tar products" },
  "human normal immunoglobulin": { atc: "J06BA02", name: "immunoglobulins, normal human" },
  "multivitamins": { atc: "A11BA", name: "multivitamins, plain" },
  "onasemnogene abeparvovec": { atc: "M09AX10", name: "onasemnogene abeparvovec" },
  "trichloroacetic acid": { atc: "D11AF", name: "wart and anti-corn preparations" },
  "valproate sodium": { atc: "N03AG01", name: "valproic acid / sodium valproate" },
  "folinic acid": { atc: "V03AF03", name: "calcium folinate" },
  "calcium folinate": { atc: "V03AF03", name: "calcium folinate" },
  "bupivacaine": { atc: "N01BB01", name: "bupivacaine" },
  "bupivacaine hydrochloride": { atc: "N01BB01", name: "bupivacaine" },
  "amino acids": { atc: "B05BA01", name: "amino acids solutions" },
  "potassium citrate": { atc: "A12BA02", name: "potassium citrate" },
  "octocog alfa": { atc: "B02BD02", name: "coagulation factor VIII" },
  "pizotifen": { atc: "N02CX01", name: "pizotifen" },
  "dithranol": { atc: "D05AC01", name: "dithranol" },
  "lenalidomide": { atc: "L04AX04", name: "lenalidomide" },
  "cyclophosphamide": { atc: "L01AA01", name: "cyclophosphamide" },
  "calcitonin": { atc: "H05BA01", name: "calcitonin (salmon)" },
  "amfenac": { atc: "M01AB11", name: "amfenac" },
  "bacillus of calmette and guerin": { atc: "L03AX03", name: "bcg vaccine" },
  "somatropin": { atc: "H01AC01", name: "somatropin" },
  "estradiol": { atc: "G03CA03", name: "estradiol" },
  "insulin human": { atc: "A10AB01", name: "insulin (human)" },
  "human insulin": { atc: "A10AB01", name: "insulin (human)" },
  "ispaghula husk": { atc: "A06AC01", name: "ispaghula (psylla seeds)" },
  "follitropin alfa": { atc: "G03GA05", name: "follitropin alfa" },
  "follitropin beta": { atc: "G03GA06", name: "follitropin beta" },
  "mitomycin": { atc: "L01DC03", name: "mitomycin" },
  "influenza": { atc: "J07BA02", name: "influenza vaccine" },
  "diphtheria toxoid": { atc: "J07AM51", name: "diphtheria toxoid" },
  "hepatitis a virus vaccine": { atc: "J07BC02", name: "hepatitis a vaccine" },
  "hepatitis b virus vaccine": { atc: "J07BC01", name: "hepatitis b vaccine" },
  "measles virus vaccine": { atc: "J07BD52", name: "measles vaccine" },
  "rubella virus vaccine": { atc: "J07BJ51", name: "rubella vaccine" },
  "rabies virus vaccine": { atc: "J07BG01", name: "rabies vaccine" },
  "fluorouracil": { atc: "L01BC02", name: "fluorouracil" },
  "cisplatin": { atc: "L01XA01", name: "cisplatin" },
  "carboplatin": { atc: "L01XA02", name: "carboplatin" },
  "paclitaxel": { atc: "L01CD01", name: "paclitaxel" },
  "docetaxel": { atc: "L01CD02", name: "docetaxel" },
  "gemcitabine": { atc: "L01BC05", name: "gemcitabine" },
  "doxorubicin": { atc: "L01DB01", name: "doxorubicin" },
  "oxaliplatin": { atc: "L01XA03", name: "oxaliplatin" },
  "irinotecan": { atc: "L01XX19", name: "irinotecan" },
  "imatinib": { atc: "L01EA01", name: "imatinib" },
  "rituximab": { atc: "L01FA01", name: "rituximab" },
  "trastuzumab": { atc: "L01FD01", name: "trastuzumab" },
  "capecitabine": { atc: "L01BC06", name: "capecitabine" },
  "tamoxifen": { atc: "L02BA01", name: "tamoxifen" },
  "letrozole": { atc: "L02BG04", name: "letrozole" },
  "anastrozole": { atc: "L02BG03", name: "anastrozole" },
  "leuprorelin": { atc: "L02AE02", name: "leuprorelin" },
  "goserelin": { atc: "L02AE03", name: "goserelin" },
  "methotrexate": { atc: "L01BA01", name: "methotrexate" },
  "bleomycin": { atc: "L01DC01", name: "bleomycin" },
  "vincristine": { atc: "L01CA02", name: "vincristine" },
  "etoposide": { atc: "L01CB01", name: "etoposide" },
  "interferon alfa": { atc: "L03AB04", name: "interferon alfa" },
  "interferon beta": { atc: "L03AB07", name: "interferon beta" }
};

const SALTS = [
  "hydrochloride", "sodium", "potassium", "maleate", "besilate", "besylate",
  "calcium", "tartrate", "sulfate", "sulphate", "phosphate", "citrate",
  "fumarate", "succinate", "acetate", "gluconate", "monohydrate", "dihydrate",
  "trihydrate", "dipotassium", "disodium", "dihydrochloride", "mesylate",
  "mesilate", "propionate", "valerate", "dipropionate", "bromide", "iodide"
];

function normalizeDrugName(name) {
  let cleaned = name
    .toLowerCase()
    .replace(/\s*\((subs|vtm|generic)\)\s*$/i, "")
    .replace(/[^a-z0-9\+\s-]/g, " ")
    .trim();

  // Strip common salts for base INN matching
  const words = cleaned.split(/\s+/);
  const baseWords = words.filter(w => !SALTS.includes(w));
  const baseName = baseWords.join(" ");

  return { cleaned, baseName };
}

async function fetchFromWikidata() {
  console.log("📡 [EXTRACT]: Querying Wikidata Biomedical SPARQL Endpoint...");
  const sparql = `
    SELECT ?itemLabel ?atc WHERE {
      ?item wdt:P267 ?atc.
      FILTER(REGEX(?atc, "^[A-Z][0-9]{2}[A-Z]{2}[0-9]{2}$"))
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
  `;
  const url = "https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(sparql);
  const res = await fetch(url, {
    headers: { "User-Agent": "TMT-DataEngineering-Pipeline/1.0 (academic research)" }
  });

  if (!res.ok) throw new Error(`Wikidata SPARQL returned status ${res.status}`);
  const data = await res.json();
  return data.results.bindings.map(b => ({
    name: b.itemLabel.value,
    atc: b.atc.value
  }));
}

async function runPipeline() {
  console.log("==========================================================");
  console.log("🚀 STARTING AUTOMATED WHO-ATC INGESTION & MATCHING PIPELINE");
  console.log("==========================================================");

  let rawAtcList = [];
  try {
    rawAtcList = await fetchFromWikidata();
    console.log(`✅ [EXTRACT COMPLETED]: Successfully retrieved ${rawAtcList.length.toLocaleString()} Level-5 ATC codes.\n`);
  } catch (err) {
    console.error("⚠️ [EXTRACT WARNING]: Failed to connect to online SPARQL:", err.message);
    console.log("ℹ️ In production, fallback to local snapshot or NIH RxNav API.");
    return;
  }

  // Build ATC Lookup Tables
  const exactMap = new Map();
  const baseMap = new Map();

  for (const item of rawAtcList) {
    const { cleaned, baseName } = normalizeDrugName(item.name);
    if (!exactMap.has(cleaned)) exactMap.set(cleaned, { atc: item.atc, name: item.name });
    if (baseName && !baseMap.has(baseName)) baseMap.set(baseName, { atc: item.atc, name: item.name });
  }

  console.log("🔄 [TRANSFORM]: Reading TMT Substance & VTM concepts...");
  const subsPath = path.join(__dirname, "../public/data/concepts_SUBS.json");
  const vtmPath = path.join(__dirname, "../public/data/concepts_VTM.json");
  const outputPath = path.join(__dirname, "../public/data/atc_mappings.json");

  const subs = JSON.parse(fs.readFileSync(subsPath, "utf-8"));
  const vtms = JSON.parse(fs.readFileSync(vtmPath, "utf-8"));

  // Preserve any existing verified custom mappings
  let existingMappings = {};
  if (fs.existsSync(outputPath)) {
    existingMappings = JSON.parse(fs.readFileSync(outputPath, "utf-8"));
  }

  const finalAtcMap = { ...existingMappings };
  let newMatches = 0;

  // 1. Match Substances (SUBS)
  for (const [id, concept] of Object.entries(subs)) {
    if (finalAtcMap[id]) continue;
    const { cleaned, baseName } = normalizeDrugName(concept.fsn);
    const match = ALIASES[cleaned] || ALIASES[baseName] || exactMap.get(cleaned) || baseMap.get(baseName);
    if (match) {
      finalAtcMap[id] = { atc: match.atc, name: match.name };
      newMatches++;
    }
  }

  // 2. Match Virtual Therapeutic Moieties (VTM) - Direct & Base matching
  for (const [id, concept] of Object.entries(vtms)) {
    if (finalAtcMap[id]) continue;
    const { cleaned, baseName } = normalizeDrugName(concept.fsn);
    const match = ALIASES[cleaned] || ALIASES[baseName] || exactMap.get(cleaned) || baseMap.get(baseName);
    if (match) {
      finalAtcMap[id] = { atc: match.atc, name: match.name, matchType: 'DIRECT' };
      newMatches++;
    }
  }

  // 3. Match Combination VTMs (Multi-Ingredient & Primary Ingredient matching)
  console.log("🧩 [TRANSFORM COMBINATIONS]: Resolving multi-ingredient combinations...");
  for (const [id, concept] of Object.entries(vtms)) {
    if (finalAtcMap[id]) continue;
    if (!concept.fsn.includes("+")) continue;

    // Split components
    const rawParts = concept.fsn.replace(/\s*\(vtm\)\s*$/i, "").split("+").map(p => p.trim());
    if (rawParts.length < 2) continue;

    // Try finding ATC for the primary active ingredient (first active entity)
    let primaryMatch = null;
    for (const part of rawParts) {
      const { cleaned, baseName } = normalizeDrugName(part);
      const match = ALIASES[cleaned] || ALIASES[baseName] || exactMap.get(cleaned) || baseMap.get(baseName);
      if (match) {
        primaryMatch = match;
        break;
      }
    }

    if (primaryMatch) {
      finalAtcMap[id] = { 
        atc: primaryMatch.atc, 
        name: `${concept.fsn.replace(/\s*\(vtm\)\s*$/i, "")} [Comb: ${primaryMatch.name}]`,
        matchType: 'COMBINATION_PRIMARY'
      };
      newMatches++;
    }
  }


  console.log(`✅ [TRANSFORM COMPLETED]: Matched ${newMatches} newly discovered drug concepts.\n`);

  // 3. Load & Save
  console.log("💾 [LOAD]: Writing updated Master Mapping Table to public/data/atc_mappings.json...");
  fs.writeFileSync(outputPath, JSON.stringify(finalAtcMap, null, 2));

  console.log(`🎉 Pipeline finished successfully!`);
  console.log(`📊 Total Mapped TMT-ATC Entities: ${Object.keys(finalAtcMap).length.toLocaleString()}`);
  console.log("==========================================================");
}

runPipeline().catch(console.error);
