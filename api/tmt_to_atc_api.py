"""
TMT-to-ATC Code Translation API
================================
REST API สำหรับแปลงรหัสยามาตรฐานไทย (TMT) เป็นรหัสยาโลก WHO-ATC
รองรับ:
  1. GET  /api/lookup/<tmt_code>       — ค้นหา ATC จากรหัส TMT เดี่ยว
  2. POST /api/batch                   — ค้นหา ATC จากรหัส TMT หลายตัวพร้อมกัน
  3. GET  /api/search?q=<drug_name>    — ค้นหาด้วยชื่อยา (ภาษาไทย/อังกฤษ)
  4. GET  /api/stats                   — สรุปสถิติของฐานข้อมูล
  5. GET  /api/atc/<atc_code>          — Reverse lookup: หายา TMT จากรหัส ATC

ติดตั้ง: pip install flask flask-cors
รัน:     python tmt_to_atc_api.py
เปิดใช้:  http://localhost:5050
"""

import sqlite3
import os
import json
from flask import Flask, request, jsonify
from flask_cors import CORS
from functools import lru_cache

# ==============================================================================
# Configuration
# ==============================================================================
DB_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "db", "tmt_drug_database.sqlite"
)

app = Flask(__name__)
CORS(app)  # เปิดให้เรียกจากทุก Domain (Cross-Origin)


def get_db():
    """สร้าง Connection ใหม่ทุกครั้ง (Thread-Safe)"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


# ==============================================================================
# Core Logic: Graph Traversal เพื่อหา ATC Code
# ==============================================================================
def resolve_atc_by_traversal(conn, tmt_code: str) -> list:
    """
    ค้นหารหัส ATC โดยใช้ Recursive CTE วิ่งขึ้นไปตาม Hierarchy:
    TPU → TP/GPU → GP → VTM → SUBS จนเจอ ATC Code
    
    ทำงานได้กับทุกระดับยา:
    - ถ้าใส่รหัส VTM/SUBS ที่มี ATC ตรง → ได้เลยทันที
    - ถ้าใส่รหัส TPU/GPU ที่ไม่มี ATC ตรง → วิ่ง Graph ขึ้นไปหา
    """
    cursor = conn.execute("""
        WITH RECURSIVE ancestors(id, depth) AS (
            SELECT ?, 0
            UNION ALL
            SELECT r.parent_id, a.depth + 1
            FROM fact_relation r
            JOIN ancestors a ON r.child_id = a.id
            WHERE a.depth < 8
        )
        SELECT DISTINCT
            a.id AS ancestor_id,
            a.depth,
            c.concept_type,
            c.fsn,
            m.atc_code,
            m.atc_name
        FROM ancestors a
        JOIN dim_concept c ON c.concept_id = a.id
        JOIN map_concept_atc m ON m.concept_id = a.id
        WHERE m.atc_code IS NOT NULL
        ORDER BY a.depth ASC
    """, (tmt_code,))
    
    results = []
    seen_atc = set()
    for row in cursor.fetchall():
        if row["atc_code"] not in seen_atc:
            seen_atc.add(row["atc_code"])
            results.append({
                "atc_code": row["atc_code"],
                "atc_name": row["atc_name"],
                "matched_via": row["concept_type"],
                "matched_concept_id": row["ancestor_id"],
                "matched_concept_name": row["fsn"],
                "graph_depth": row["depth"]
            })
    return results


def get_concept_info(conn, tmt_code: str) -> dict | None:
    """ดึงข้อมูลรายละเอียดของ Concept"""
    cursor = conn.execute("""
        SELECT concept_id, concept_type, fsn, trade_name,
               active_ingredient, strength, dosage_form, manufacturer
        FROM dim_concept
        WHERE concept_id = ?
    """, (tmt_code,))
    row = cursor.fetchone()
    if row:
        return dict(row)
    return None


# ==============================================================================
# API Endpoints
# ==============================================================================

@app.route("/")
def index():
    """หน้าแรก — แสดงรายการ Endpoints ที่ใช้ได้"""
    return jsonify({
        "service": "TMT-to-ATC Code Translation API",
        "version": "1.0.0",
        "description": "แปลงรหัสยามาตรฐานไทย (TMT) เป็นรหัสยาสากล WHO-ATC",
        "endpoints": {
            "GET /api/lookup/<tmt_code>": "แปลงรหัส TMT เดี่ยวเป็น ATC Code",
            "POST /api/batch": "แปลงรหัส TMT หลายตัว (body: {\"codes\": [\"123\", \"456\"]})",
            "GET /api/search?q=<name>": "ค้นหายาด้วยชื่อ (ไทย/อังกฤษ)",
            "GET /api/atc/<atc_code>": "Reverse lookup: หายา TMT จากรหัส ATC",
            "GET /api/stats": "สรุปสถิติฐานข้อมูล"
        },
        "database": DB_PATH,
        "examples": {
            "lookup": "/api/lookup/100014",
            "search": "/api/search?q=paracetamol",
            "atc_reverse": "/api/atc/N02BE01",
            "batch": "POST /api/batch with {\"codes\": [\"100014\", \"220295\"]}"
        }
    })


@app.route("/api/lookup/<tmt_code>")
def lookup_single(tmt_code: str):
    """
    แปลงรหัส TMT เดี่ยวเป็น ATC Code
    ใช้ Graph Traversal วิ่งขึ้นไปตาม Hierarchy จนเจอ ATC
    
    ตัวอย่าง: GET /api/lookup/100014
    """
    conn = get_db()
    try:
        # 1. ดึงข้อมูล Concept
        concept = get_concept_info(conn, tmt_code)
        if not concept:
            return jsonify({
                "success": False,
                "error": f"ไม่พบรหัส TMT: {tmt_code}",
                "suggestion": "ลองใช้ /api/search?q=ชื่อยา เพื่อค้นหารหัสที่ถูกต้อง"
            }), 404
        
        # 2. ค้นหา ATC ด้วย Graph Traversal
        atc_results = resolve_atc_by_traversal(conn, tmt_code)
        
        return jsonify({
            "success": True,
            "tmt_code": tmt_code,
            "concept": concept,
            "atc_results": atc_results,
            "atc_count": len(atc_results),
            "primary_atc": atc_results[0] if atc_results else None,
            "note": "primary_atc คือรหัส ATC ที่ใกล้ที่สุดใน Hierarchy (depth ต่ำสุด)"
        })
    finally:
        conn.close()


@app.route("/api/batch", methods=["POST"])
def lookup_batch():
    """
    แปลงรหัส TMT หลายตัวพร้อมกัน
    
    ตัวอย่าง: POST /api/batch
    Body: {"codes": ["100014", "220295", "220305"]}
    """
    data = request.get_json()
    if not data or "codes" not in data:
        return jsonify({
            "success": False,
            "error": "กรุณาส่ง JSON body: {\"codes\": [\"tmt_code_1\", \"tmt_code_2\", ...]}"
        }), 400
    
    codes = data["codes"]
    if len(codes) > 500:
        return jsonify({
            "success": False,
            "error": "จำกัดสูงสุด 500 รหัสต่อครั้ง"
        }), 400
    
    conn = get_db()
    try:
        results = {}
        matched = 0
        unmatched = 0
        
        for code in codes:
            code = str(code).strip()
            concept = get_concept_info(conn, code)
            atc_results = resolve_atc_by_traversal(conn, code) if concept else []
            
            if concept and atc_results:
                matched += 1
                results[code] = {
                    "found": True,
                    "concept_type": concept["concept_type"],
                    "fsn": concept["fsn"],
                    "primary_atc_code": atc_results[0]["atc_code"],
                    "primary_atc_name": atc_results[0]["atc_name"],
                    "all_atc": atc_results
                }
            elif concept:
                unmatched += 1
                results[code] = {
                    "found": True,
                    "concept_type": concept["concept_type"],
                    "fsn": concept["fsn"],
                    "primary_atc_code": None,
                    "primary_atc_name": None,
                    "note": "พบรหัส TMT แต่ไม่มี ATC mapping"
                }
            else:
                unmatched += 1
                results[code] = {
                    "found": False,
                    "error": "ไม่พบรหัส TMT นี้ในฐานข้อมูล"
                }
        
        return jsonify({
            "success": True,
            "total_requested": len(codes),
            "matched": matched,
            "unmatched": unmatched,
            "coverage": f"{(matched / len(codes) * 100):.2f}%" if codes else "0%",
            "results": results
        })
    finally:
        conn.close()


@app.route("/api/search")
def search_by_name():
    """
    ค้นหายาด้วยชื่อ (ภาษาไทย/อังกฤษ) แล้วแปลงเป็น ATC Code
    
    ตัวอย่าง: GET /api/search?q=paracetamol
              GET /api/search?q=amoxicillin&limit=5
    """
    query = request.args.get("q", "").strip()
    limit = min(int(request.args.get("limit", 20)), 100)
    
    if not query or len(query) < 2:
        return jsonify({
            "success": False,
            "error": "กรุณาระบุ q=ชื่อยา (อย่างน้อย 2 ตัวอักษร)"
        }), 400
    
    conn = get_db()
    try:
        # ค้นหาจาก fsn, trade_name, active_ingredient
        search_term = f"%{query}%"
        cursor = conn.execute("""
            SELECT concept_id, concept_type, fsn, trade_name,
                   active_ingredient, strength, dosage_form
            FROM dim_concept
            WHERE fsn LIKE ? OR trade_name LIKE ? OR active_ingredient LIKE ?
            ORDER BY
                CASE concept_type
                    WHEN 'SUBS' THEN 1
                    WHEN 'VTM' THEN 2
                    WHEN 'GP' THEN 3
                    WHEN 'GPU' THEN 4
                    WHEN 'TP' THEN 5
                    WHEN 'TPU' THEN 6
                    ELSE 7
                END
            LIMIT ?
        """, (search_term, search_term, search_term, limit))
        
        results = []
        for row in cursor.fetchall():
            atc = resolve_atc_by_traversal(conn, row["concept_id"])
            results.append({
                "tmt_code": row["concept_id"],
                "concept_type": row["concept_type"],
                "fsn": row["fsn"],
                "trade_name": row["trade_name"],
                "active_ingredient": row["active_ingredient"],
                "strength": row["strength"],
                "dosage_form": row["dosage_form"],
                "primary_atc_code": atc[0]["atc_code"] if atc else None,
                "primary_atc_name": atc[0]["atc_name"] if atc else None
            })
        
        return jsonify({
            "success": True,
            "query": query,
            "total_results": len(results),
            "results": results
        })
    finally:
        conn.close()


@app.route("/api/atc/<atc_code>")
def reverse_lookup_atc(atc_code: str):
    """
    Reverse Lookup: หายา TMT ทั้งหมดที่แมปกับรหัส ATC นี้
    
    ตัวอย่าง: GET /api/atc/N02BE01
    """
    conn = get_db()
    try:
        cursor = conn.execute("""
            SELECT m.concept_id, m.atc_code, m.atc_name, m.confidence_score,
                   c.concept_type, c.fsn, c.active_ingredient
            FROM map_concept_atc m
            JOIN dim_concept c ON c.concept_id = m.concept_id
            WHERE UPPER(m.atc_code) = UPPER(?)
            ORDER BY c.concept_type
        """, (atc_code,))
        
        results = [dict(row) for row in cursor.fetchall()]
        
        if not results:
            return jsonify({
                "success": False,
                "error": f"ไม่พบรหัส ATC: {atc_code}"
            }), 404
        
        return jsonify({
            "success": True,
            "atc_code": atc_code.upper(),
            "atc_name": results[0]["atc_name"],
            "total_tmt_concepts": len(results),
            "concepts": results
        })
    finally:
        conn.close()


@app.route("/api/stats")
def database_stats():
    """สรุปสถิติของฐานข้อมูล"""
    conn = get_db()
    try:
        stats = {}
        
        for table, label in [
            ("dim_concept", "total_concepts"),
            ("fact_relation", "total_relations"),
            ("map_concept_atc", "total_atc_mappings")
        ]:
            row = conn.execute(f"SELECT COUNT(*) as cnt FROM {table}").fetchone()
            stats[label] = row["cnt"]
        
        # นับแยกตามประเภท
        type_counts = {}
        for row in conn.execute(
            "SELECT concept_type, COUNT(*) as cnt FROM dim_concept GROUP BY concept_type ORDER BY cnt DESC"
        ):
            type_counts[row["concept_type"]] = row["cnt"]
        
        # นับ ATC codes ที่ไม่ซ้ำ
        unique_atc = conn.execute(
            "SELECT COUNT(DISTINCT atc_code) as cnt FROM map_concept_atc"
        ).fetchone()["cnt"]
        
        return jsonify({
            "success": True,
            "database": DB_PATH,
            "statistics": stats,
            "concept_types": type_counts,
            "unique_atc_codes": unique_atc
        })
    finally:
        conn.close()


# ==============================================================================
# Run Server
# ==============================================================================
if __name__ == "__main__":
    print("=" * 70)
    print("  TMT-to-ATC Code Translation API")
    print(f"  Database: {DB_PATH}")
    print(f"  Server:   http://localhost:5050")
    print("=" * 70)
    print()
    print("  Endpoints:")
    print("    GET  /api/lookup/<tmt_code>    — แปลงรหัส TMT เป็น ATC")
    print("    POST /api/batch                — แปลงหลายรหัสพร้อมกัน")
    print("    GET  /api/search?q=<name>      — ค้นหาด้วยชื่อยา")
    print("    GET  /api/atc/<atc_code>       — Reverse lookup")
    print("    GET  /api/stats                — สถิติฐานข้อมูล")
    print("=" * 70)
    
    app.run(host="0.0.0.0", port=5050, debug=True)
