-- ==========================================================
-- Healthcare Data Engineering: SQL Analytics & Reporting
-- Database: db/tmt_drug_database.sqlite
-- ==========================================================

-- 1. Concept Count by TMT Hierarchy Level
SELECT 
    concept_type,
    COUNT(*) AS total_concepts,
    ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM dim_concept), 2) AS percentage
FROM dim_concept
GROUP BY concept_type
ORDER BY total_concepts DESC;

-- 2. Analysis of Top WHO-ATC Main Groups in Thailand (GPU Level)
SELECT 
    SUBSTR(m.atc_code, 1, 1) AS atc_group_code,
    CASE SUBSTR(m.atc_code, 1, 1)
        WHEN 'A' THEN 'Alimentary tract & metabolism (ระบบทางเดินอาหาร)'
        WHEN 'N' THEN 'Nervous system (ระบบประสาท)'
        WHEN 'D' THEN 'Dermatologicals (โรคผิวหนัง)'
        WHEN 'J' THEN 'Antiinfectives for systemic use (ยาต้านการติดเชื้อ)'
        WHEN 'B' THEN 'Blood & blood forming organs (ระบบเลือด)'
        WHEN 'R' THEN 'Respiratory system (ระบบทางเดินหายใจ)'
        WHEN 'H' THEN 'Systemic hormonal preparations (ฮอร์โมน)'
        WHEN 'C' THEN 'Cardiovascular system (หัวใจและหลอดเลือด)'
        WHEN 'L' THEN 'Antineoplastic / Oncology (มะเร็งและภูมิคุ้มกัน)'
        WHEN 'M' THEN 'Musculo-skeletal system (กล้ามเนื้อและกระดูก)'
        WHEN 'G' THEN 'Genito urinary system (ทางเดินปัสสาวะและสืบพันธุ์)'
        WHEN 'V' THEN 'Various (ยาอื่นๆ/สารละลาย)'
        WHEN 'S' THEN 'Sensory organs (ตา/หู)'
        WHEN 'P' THEN 'Antiparasitic products (ต้านปรสิต)'
        ELSE 'Other'
    END AS anatomical_main_group,
    COUNT(DISTINCT gpu.concept_id) AS total_gpu_count
FROM dim_concept gpu
JOIN fact_relation r_gp ON gpu.concept_id = r_gp.child_id
JOIN fact_relation r_vtm ON r_gp.parent_id = r_vtm.child_id
JOIN map_concept_atc m ON (m.concept_id = r_vtm.parent_id OR m.concept_id = r_gp.parent_id OR m.concept_id = gpu.concept_id)
WHERE gpu.concept_type = 'GPU'
GROUP BY atc_group_code
ORDER BY total_gpu_count DESC;

-- 3. Audit Log: Pipeline Execution & AI Quality Gate
SELECT 
    run_id,
    orchestrator,
    release_version,
    total_concepts_ingested,
    gpu_coverage_pct || '%' AS gpu_coverage,
    tpu_coverage_pct || '%' AS tpu_coverage,
    ai_agent_status,
    ai_agent_assessment,
    created_at
FROM pipeline_audit_log
ORDER BY created_at DESC;
