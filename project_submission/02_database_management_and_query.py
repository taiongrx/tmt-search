"""
02_database_management_and_query.py
--------------------------------------------------------------------------------
หัวข้อที่ 2: Database / Data Warehouse Management (10 คะแนน)
2.1 เหตุผลการเลือกใช้ Relational Database (3 คะแนน):
    - โครงสร้างข้อมูลยา TMT มีลำดับขั้นเชิงสัมพันธ์ชัดเจน (Strict Hierarchical Relations: SUBS->VTM->GP->GPU/TP->TPU->GPP->TPP)
    - ต้องการคุณสมบัติ ACID และ Referential Integrity (Foreign Key Constraints) เพื่อป้องกันข้อมูลขยะ (Orphaned Codes) ในระบบจ่ายยาโรงพยาบาล
    - รองรับการทำ JOIN หลายระดับ และการทำ B-Tree Indexing เพื่อ Query รหัสยาความเร็วสูง (< 1ms)
2.2 การออกแบบ Schema และการจัดเก็บข้อมูลดิบที่ประมวลผลแล้วลง Database (3 คะแนน)
2.3 การ Query ข้อมูลออกมาแสดงผลและวิเคราะห์ผ่าน Python Code (4 คะแนน)
--------------------------------------------------------------------------------
"""

import sqlite3
from typing import List, Tuple, Any

DB_FILE = "tmt_drug_warehouse.db"

# ==============================================================================
# 2.2 การสร้าง Schema DDL และ Indexing (3 คะแนน)
# ==============================================================================
def initialize_database(db_path: str = DB_FILE):
    """
    สร้างฐานข้อมูลเชิงสัมพันธ์ (Relational Schema) ที่ได้มาตรฐาน 3NF:
    1. tmt_concepts: เก็บ Concept ID, ประเภท (SUBS-TPP), ชื่อทางการ (FSN)
    2. tmt_relations: เก็บความสัมพันธ์ระหว่าง Parent Concept และ Child Concept
    3. atc_mappings: เก็บรหัส WHO-ATC เทียบกับ Substance / VTM
    4. hospital_drug_catalog: เก็บบัญชียาท้องถิ่นของโรงพยาบาล
    """
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # 1. ตาราง Concept หลัก
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS tmt_concepts (
        tmt_id VARCHAR(20) PRIMARY KEY,
        concept_type VARCHAR(10) NOT NULL,
        hierarchy_level INTEGER NOT NULL,
        fsn TEXT NOT NULL,
        trade_name TEXT,
        manufacturer TEXT,
        strength TEXT,
        dosage_form TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)
    
    # 2. ตาราง Relation แบบ Parent-Child Hierarchical Graph
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS tmt_relations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        parent_id VARCHAR(20) NOT NULL,
        child_id VARCHAR(20) NOT NULL,
        relation_type VARCHAR(20),
        FOREIGN KEY (parent_id) REFERENCES tmt_concepts(tmt_id) ON DELETE CASCADE,
        FOREIGN KEY (child_id) REFERENCES tmt_concepts(tmt_id) ON DELETE CASCADE,
        UNIQUE(parent_id, child_id)
    );
    """)
    
    # 3. ตาราง ATC Mapping
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS atc_mappings (
        tmt_id VARCHAR(20) PRIMARY KEY,
        atc_code VARCHAR(15) NOT NULL,
        atc_name TEXT,
        FOREIGN KEY (tmt_id) REFERENCES tmt_concepts(tmt_id)
    );
    """)
    
    # 4. ตาราง Hospital Drug Catalog (Local HIS)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS hospital_drug_catalog (
        local_code VARCHAR(50) PRIMARY KEY,
        local_name TEXT NOT NULL,
        mapped_tmt_id VARCHAR(20),
        match_confidence REAL,
        FOREIGN KEY (mapped_tmt_id) REFERENCES tmt_concepts(tmt_id)
    );
    """)
    
    # Performance Optimization: B-Tree Indexing
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_concept_type ON tmt_concepts(concept_type);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_concept_fsn ON tmt_concepts(fsn);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_rel_parent ON tmt_relations(parent_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_rel_child ON tmt_relations(child_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_atc_code ON atc_mappings(atc_code);")
    
    conn.commit()
    conn.close()
    print(f"[DB Management 2.2] สร้างโครงสร้าง Relational Database Schema และ Index สำเร็จ ({db_path})")


def load_processed_data_to_db(db_path: str = DB_FILE):
    """
    โหลดข้อมูลดิบที่ผ่านการ Cleanse แล้ว เข้าสู่ Database
    """
    conn = sqlite3.connect(db_path)
    
    # ข้อมูล Concepts (ในระบบจริงประมวลผล 112,069 รายการ)
    concepts_sample = [
        ('225929', 'SUBS', 1, 'Warfarin Sodium (substance)', None, None, None, None),
        ('220380', 'VTM', 2, 'amoxicillin (trihydrate)', None, None, None, None),
        ('210051', 'GP', 3, 'amoxicillin (trihydrate) 500 mg capsule', None, None, '500 mg', 'capsule'),
        ('200745', 'GPU', 4, 'amoxicillin (trihydrate) 500 mg capsule, hard', None, None, '500 mg', 'capsule, hard'),
        ('154302', 'TP', 4, 'Amoxycillin GPO 500 mg capsule', 'Amoxycillin GPO', 'องค์การเภสัชกรรม', '500 mg', 'capsule'),
        ('100014', 'TPU', 5, 'Amoxycillin GPO 500 mg capsule, 10x10 capsules', 'Amoxycillin GPO', 'องค์การเภสัชกรรม', '500 mg', 'capsule'),
    ]
    
    relations_sample = [
        ('220380', '210051', 'VTMtoGP'),
        ('210051', '200745', 'GPtoGPU'),
        ('210051', '154302', 'GPtoTP'),
        ('200745', '100014', 'GPUtoTPU'),
        ('154302', '100014', 'TPtoTPU'),
    ]
    
    atc_sample = [
        ('225929', 'B01AA03', 'Warfarin'),
        ('220380', 'J01CA04', 'Amoxicillin')
    ]
    
    hospital_sample = [
        ('1000001', 'Amoxy cap 500mg GPO (icode 1000001)', '100014', 0.95),
        ('1000002', 'Warfarin tablet 3mg (icode 1000002)', '225929', 0.90)
    ]
    
    cursor = conn.cursor()
    cursor.executemany("INSERT OR REPLACE INTO tmt_concepts (tmt_id, concept_type, hierarchy_level, fsn, trade_name, manufacturer, strength, dosage_form) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", concepts_sample)
    cursor.executemany("INSERT OR IGNORE INTO tmt_relations (parent_id, child_id, relation_type) VALUES (?, ?, ?)", relations_sample)
    cursor.executemany("INSERT OR REPLACE INTO atc_mappings (tmt_id, atc_code, atc_name) VALUES (?, ?, ?)", atc_sample)
    cursor.executemany("INSERT OR REPLACE INTO hospital_drug_catalog (local_code, local_name, mapped_tmt_id, match_confidence) VALUES (?, ?, ?, ?)", hospital_sample)
    
    conn.commit()
    conn.close()
    print(f"[DB Management 2.2] Ingest ข้อมูลเข้าตาราง Database ทั้ง 4 ตารางเรียบร้อย")


# ==============================================================================
# 2.3 การ Query ข้อมูลออกมาแสดงผลผ่าน Python Code (4 คะแนน)
# ==============================================================================
def print_query_table(cursor: sqlite3.Cursor, title: str):
    rows = cursor.fetchall()
    cols = [desc[0] for desc in cursor.description]
    
    print("\n" + "=" * 95)
    print(f" {title}")
    print("=" * 95)
    
    # Calculate column widths
    widths = [len(c) for c in cols]
    for row in rows:
        for i, val in enumerate(row):
            widths[i] = max(widths[i], len(str(val) if val is not None else "-"))
            
    header_str = " | ".join(f"{cols[i]:<{widths[i]}}" for i in range(len(cols)))
    print(header_str)
    print("-" * len(header_str))
    for row in rows:
        row_str = " | ".join(f"{str(row[i]) if row[i] is not None else '-':<{widths[i]}}" for i in range(len(cols)))
        print(row_str)
    print("=" * 95)


def query_drug_lineage_and_analytics(db_path: str = DB_FILE):
    """
    ทดสอบการ Query ข้อมูลเพื่อตอบโจทย์ทางเภสัชกรรมและโรงพยาบาล:
    Query 1: สืบค้นสายสัมพันธ์ระดับยา (Lineage Trace จาก TPU -> GP -> VTM -> ATC Code)
    Query 2: รายงานสรุปจำนวนรหัสยาแยกตามระดับชั้น (Concept Distribution)
    Query 3: การเชื่อมโยงแคตตาล็อกยาโรงพยาบาลเข้ากับรหัสสากล (Integrated Drug View)
    """
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Query 1: Lineage Trace
    query1 = """
    SELECT 
        tpu.tmt_id AS TPU_ID,
        tpu.trade_name AS TRADE_NAME,
        tpu.manufacturer AS MFR,
        gp.fsn AS GENERIC_PRODUCT_GP,
        vtm.fsn AS THERAPEUTIC_VTM,
        atc.atc_code AS ATC_CODE
    FROM tmt_concepts tpu
    JOIN tmt_relations r1 ON tpu.tmt_id = r1.child_id
    JOIN tmt_concepts gp ON r1.parent_id = gp.tmt_id OR r1.parent_id IN (SELECT child_id FROM tmt_relations WHERE parent_id = gp.tmt_id)
    JOIN tmt_relations r2 ON gp.tmt_id = r2.child_id
    JOIN tmt_concepts vtm ON r2.parent_id = vtm.tmt_id
    LEFT JOIN atc_mappings atc ON vtm.tmt_id = atc.tmt_id
    WHERE tpu.concept_type = 'TPU'
    GROUP BY tpu.tmt_id;
    """
    cursor.execute(query1)
    print_query_table(cursor, "[Query 1] สืบค้นสายสัมพันธ์ระดับยา (Hierarchical Lineage: TPU -> GPU/TP -> GP -> VTM -> ATC)")
    
    # Query 2: Summary by Level
    query2 = """
    SELECT 
        hierarchy_level AS Level,
        concept_type AS Concept_Type,
        COUNT(*) AS Total_Records
    FROM tmt_concepts
    GROUP BY hierarchy_level, concept_type
    ORDER BY hierarchy_level;
    """
    cursor.execute(query2)
    print_query_table(cursor, "[Query 2] สรุปจำนวนรหัสยาแยกตามระดับชั้น (TMT Hierarchy Summary)")
    
    # Query 3: Hospital Integration View
    query3 = """
    SELECT 
        h.local_code AS Hospital_Code,
        h.local_name AS Local_Drug_Name,
        ROUND(h.match_confidence * 100, 1) || '%' AS Confidence,
        c.tmt_id AS Mapped_TMT_ID,
        c.concept_type AS Type,
        c.fsn AS TMT_Official_FSN
    FROM hospital_drug_catalog h
    LEFT JOIN tmt_concepts c ON h.mapped_tmt_id = c.tmt_id;
    """
    cursor.execute(query3)
    print_query_table(cursor, "[Query 3] การเชื่อมโยงแคตตาล็อกยา รพ. เข้ากับรหัส TMT (Hospital HIS Integration)")
    
    conn.close()


if __name__ == "__main__":
    initialize_database()
    load_processed_data_to_db()
    query_drug_lineage_and_analytics()
