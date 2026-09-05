-- ==========================================================
-- Healthcare Data Engineering: TMT & WHO-ATC Data Pipeline
-- Database Schema: PostgreSQL / Supabase / Cloud SQL
-- ==========================================================

-- 1. Dimension: TMT Concepts (All 8 Hierarchy Levels)
CREATE TABLE IF NOT EXISTS dim_concept (
    concept_id VARCHAR(20) PRIMARY KEY,
    concept_type VARCHAR(10) NOT NULL, -- SUBS, VTM, GP, GPU, GPP, TP, TPU, TPP
    fsn TEXT NOT NULL,
    trade_name TEXT,
    active_ingredient TEXT,
    dosage_form TEXT,
    strength TEXT,
    disp_unit TEXT,
    manufacturer TEXT,
    status_label VARCHAR(10) DEFAULT '0',
    release_date VARCHAR(10),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_concept_type ON dim_concept(concept_type);
CREATE INDEX IF NOT EXISTS idx_concept_ingredient ON dim_concept(active_ingredient);
CREATE INDEX IF NOT EXISTS idx_concept_trade_name ON dim_concept(trade_name);

-- 2. Fact: Hierarchical Lineage / Relationships
CREATE TABLE IF NOT EXISTS fact_relation (
    relation_id BIGSERIAL PRIMARY KEY,
    parent_id VARCHAR(20) NOT NULL,
    parent_type VARCHAR(10) NOT NULL,
    child_id VARCHAR(20) NOT NULL,
    child_type VARCHAR(10) NOT NULL,
    FOREIGN KEY (parent_id) REFERENCES dim_concept(concept_id) ON DELETE CASCADE,
    FOREIGN KEY (child_id) REFERENCES dim_concept(concept_id) ON DELETE CASCADE,
    UNIQUE(parent_id, child_id)
);

CREATE INDEX IF NOT EXISTS idx_relation_parent ON fact_relation(parent_id);
CREATE INDEX IF NOT EXISTS idx_relation_child ON fact_relation(child_id);
CREATE INDEX IF NOT EXISTS idx_relation_parent_child ON fact_relation(parent_id, child_id);

-- 3. Dimension: WHO-ATC Codes
CREATE TABLE IF NOT EXISTS dim_atc (
    atc_code VARCHAR(10) PRIMARY KEY,
    atc_level INTEGER NOT NULL, -- 1 (Anatomical), 2, 3, 4, 5 (Chemical Substance)
    atc_name TEXT NOT NULL,
    anatomical_group VARCHAR(150),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Bridge / Mapping: TMT Concept to WHO-ATC Mapping
CREATE TABLE IF NOT EXISTS map_concept_atc (
    mapping_id BIGSERIAL PRIMARY KEY,
    concept_id VARCHAR(20) NOT NULL,
    concept_type VARCHAR(10) NOT NULL,
    atc_code VARCHAR(10) NOT NULL,
    mapping_method VARCHAR(50) NOT NULL, -- EXACT_INN, SALT_STRIPPED, ALIAS, MANUAL_OVERRIDE
    confidence_score NUMERIC(3,2) DEFAULT 1.0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (concept_id) REFERENCES dim_concept(concept_id) ON DELETE CASCADE,
    UNIQUE(concept_id, atc_code)
);

CREATE INDEX IF NOT EXISTS idx_map_concept ON map_concept_atc(concept_id);
CREATE INDEX IF NOT EXISTS idx_map_atc ON map_concept_atc(atc_code);

-- 5. Audit & Orchestration Log: ETL Pipeline Runs
CREATE TABLE IF NOT EXISTS pipeline_audit_log (
    run_id VARCHAR(50) PRIMARY KEY,
    orchestrator VARCHAR(30) DEFAULT 'n8n',
    release_version VARCHAR(20) NOT NULL,
    total_concepts_ingested INTEGER NOT NULL,
    total_relations_ingested INTEGER NOT NULL,
    total_atc_mapped INTEGER NOT NULL,
    gpu_coverage_pct NUMERIC(5,2) NOT NULL,
    tpu_coverage_pct NUMERIC(5,2) NOT NULL,
    ai_agent_status VARCHAR(20) DEFAULT 'APPROVED',
    ai_agent_assessment TEXT,
    execution_time_seconds NUMERIC(6,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Analytical View: GPU with Resolved WHO-ATC Code
CREATE OR REPLACE VIEW view_gpu_atc_lineage AS
SELECT 
    gpu.concept_id AS gpu_id,
    gpu.fsn AS gpu_name,
    gpu.active_ingredient,
    gpu.strength,
    gpu.dosage_form,
    m.atc_code,
    atc.atc_name,
    m.mapping_method,
    m.confidence_score
FROM dim_concept gpu
JOIN fact_relation r_gp ON gpu.concept_id = r_gp.child_id AND r_gp.parent_type = 'GP'
JOIN fact_relation r_vtm ON r_gp.parent_id = r_vtm.child_id AND r_vtm.parent_type = 'VTM'
JOIN map_concept_atc m ON (m.concept_id = r_vtm.parent_id OR m.concept_id = r_gp.parent_id OR m.concept_id = gpu.concept_id)
LEFT JOIN dim_atc atc ON m.atc_code = atc.atc_code
WHERE gpu.concept_type = 'GPU';
