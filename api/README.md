# 💊 TMT-to-ATC Code Translation API

REST API สำหรับแปลงรหัสยามาตรฐานไทย (TMT) เป็นรหัสยาสากล WHO-ATC

ฐานข้อมูลครอบคลุม **112,154 concepts**, **168,653 relationships** และ **3,445 ATC mappings**

---

## 🚀 วิธีใช้งาน (3 ขั้นตอน)

### 1. Clone โปรเจกต์

```bash
git clone https://github.com/taiongrx/tmt-search.git
cd tmt-search
```

### 2. ติดตั้ง Dependencies

```bash
pip install -r api/requirements.txt
```

### 3. รัน API Server

```bash
python api/tmt_to_atc_api.py
```

Server จะเปิดที่ **http://localhost:5050** พร้อมใช้งานทันที

---

## 📡 API Endpoints

### 1. แปลงรหัส TMT → ATC (ตัวเดียว)

```bash
GET /api/lookup/<tmt_code>
```

**ตัวอย่าง:**
```bash
curl http://localhost:5050/api/lookup/100014
```

**Response:**
```json
{
  "success": true,
  "tmt_code": "100014",
  "concept": {
    "concept_type": "TPU",
    "fsn": "GASTRO-BISMOL 262 (บางกอกแล็ป) (bismuth subsalicylate 262 mg) tablet",
    "active_ingredient": "bismuth subsalicylate",
    "strength": "262 mg",
    "dosage_form": "tablet"
  },
  "primary_atc": {
    "atc_code": "A02BX05",
    "atc_name": "bismuth subsalicylate",
    "graph_depth": 3,
    "matched_via": "VTM"
  },
  "atc_count": 1
}
```

> 💡 **graph_depth** บอกว่า API วิ่งขึ้นไปกี่ชั้นถึงเจอ ATC (0 = ตรงเลย, 3 = วิ่งขึ้น 3 ระดับ)

---

### 2. แปลงหลายรหัสพร้อมกัน (Batch)

```bash
POST /api/batch
Content-Type: application/json
```

**ตัวอย่าง:**
```bash
curl -X POST http://localhost:5050/api/batch \
  -H "Content-Type: application/json" \
  -d '{"codes": ["100014", "220295", "220305"]}'
```

**Response:**
```json
{
  "success": true,
  "total_requested": 3,
  "matched": 3,
  "unmatched": 0,
  "coverage": "100.00%",
  "results": {
    "100014": {
      "found": true,
      "primary_atc_code": "A02BX05",
      "primary_atc_name": "bismuth subsalicylate"
    },
    "220295": {
      "found": true,
      "primary_atc_code": "L01BC02",
      "primary_atc_name": "fluorouracil"
    }
  }
}
```

> ⚡ รองรับสูงสุด **500 รหัส** ต่อครั้ง

---

### 3. ค้นหาด้วยชื่อยา (ไทย/อังกฤษ)

```bash
GET /api/search?q=<ชื่อยา>&limit=<จำนวน>
```

**ตัวอย่าง:**
```bash
# ค้นหาภาษาอังกฤษ
curl "http://localhost:5050/api/search?q=paracetamol&limit=5"

# ค้นหาภาษาไทย
curl "http://localhost:5050/api/search?q=พาราเซตามอล"
```

---

### 4. Reverse Lookup — หายา TMT จากรหัส ATC

```bash
GET /api/atc/<atc_code>
```

**ตัวอย่าง:**
```bash
curl http://localhost:5050/api/atc/N02BE01
```

**Response:** แสดงยา TMT ทั้งหมดที่แมปกับ ATC code นั้น

---

### 5. สถิติฐานข้อมูล

```bash
GET /api/stats
```

```bash
curl http://localhost:5050/api/stats
```

---

## 🐍 ใช้จาก Python

```python
import requests

# แปลงรหัสเดี่ยว
resp = requests.get("http://localhost:5050/api/lookup/100014")
data = resp.json()
print(data["primary_atc"]["atc_code"])  # A02BX05

# แปลงหลายรหัส
resp = requests.post("http://localhost:5050/api/batch", json={
    "codes": ["100014", "220295", "220305"]
})
for code, result in resp.json()["results"].items():
    print(f"{code} → {result.get('primary_atc_code', 'N/A')}")

# ค้นหาด้วยชื่อ
resp = requests.get("http://localhost:5050/api/search", params={"q": "amoxicillin"})
for drug in resp.json()["results"]:
    print(f"{drug['fsn']} → {drug['primary_atc_code']}")
```

---

## 📊 ใช้จาก JavaScript / Fetch

```javascript
// แปลงรหัสเดี่ยว
const res = await fetch("http://localhost:5050/api/lookup/100014");
const data = await res.json();
console.log(data.primary_atc.atc_code); // A02BX05

// Batch
const batch = await fetch("http://localhost:5050/api/batch", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ codes: ["100014", "220295"] })
});
console.log(await batch.json());
```

---

## 🏗 สถาปัตยกรรม

```
รหัสยา (TMT Code)
       │
       ▼
  ┌──────────────────────────────┐
  │   Graph Traversal (Recursive CTE)   │
  │                              │
  │   TPU → TP/GPU → GP → VTM → SUBS   │
  │                              │
  │   วิ่งขึ้นไปจนเจอ ATC mapping       │
  └──────────────────────────────┘
       │
       ▼
  ATC Code (เช่น N02BE01)
```

- ใส่รหัสระดับไหนก็ได้ (TPU, GPU, GP, VTM, SUBS) → API จะหา ATC ให้อัตโนมัติ
- ใช้ **Recursive CTE** ใน SQLite วิ่งตาม parent-child hierarchy
- Database ขนาด 42 MB มากับ repo พร้อมใช้ทันที

---

## 📋 ข้อมูลอ้างอิง

| รายการ | จำนวน |
|---|---|
| Concepts (ยาทุกระดับ) | 112,154 |
| Relationships (เส้นความสัมพันธ์) | 168,653 |
| ATC Mappings | 3,445 |
| Unique ATC Codes | 1,201 |

**แหล่งข้อมูล:**
- Thai Medicines Terminology (TMT) — สำนักงานพัฒนามาตรฐานระบบข้อมูลสุขภาพไทย (สมสท.)
- WHO-ATC Classification — World Health Organization ผ่าน Wikidata SPARQL API
