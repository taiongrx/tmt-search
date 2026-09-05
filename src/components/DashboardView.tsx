import React, { useEffect, useState } from 'react';
import { Database, FileText, CheckCircle } from 'lucide-react';
import type { MetaInfo } from '../types/tmt';

interface DashboardViewProps {
  onNavigate: (view: 'TRANSLATOR' | 'BROWSER') => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate }) => {
  const [meta, setMeta] = useState<MetaInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/data/meta.json')
      .then(res => res.json())
      .then(data => {
        setMeta(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error loading TMT metadata:', err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="spinner-wrapper">
        <div className="spinner"></div>
        <p className="text-muted">กำลังโหลดข้อมูลระบบ TMT...</p>
      </div>
    );
  }

  const levelDescriptions: Record<string, string> = {
    SUBS: 'สารตั้งต้นยาเดี่ยว (Substance)',
    VTM: 'กลุ่มตัวยาสำคัญร่วม (Virtual Therapeutic Moiety)',
    GP: 'ยาชื่อสามัญระดับความแรงและรูปแบบ (Generic Product)',
    TP: 'ยาชื่อการค้าระดับผู้ผลิต (Trade Product)',
    GPU: 'ยาชื่อสามัญระบุหน่วยการใช้ (Generic Product Use)',
    TPU: 'ยาชื่อการค้าระบุหน่วยการใช้ (Trade Product Use)',
    GPP: 'ยาชื่อสามัญระบุขนาดบรรจุ (Generic Product Pack)',
    TPP: 'ยาชื่อการค้าระบุขนาดบรรจุ (Trade Product Pack)'
  };

  const getLevelColor = (type: string) => {
    switch (type) {
      case 'SUBS': return 'var(--accent)';
      case 'VTM': return 'hsl(35, 90%, 45%)';
      case 'GP': return 'var(--secondary)';
      case 'TP': return 'hsl(190, 85%, 40%)';
      case 'GPU': return 'hsl(220, 85%, 45%)';
      case 'TPU': return 'var(--primary)';
      case 'GPP': return 'hsl(300, 75%, 45%)';
      case 'TPP': return 'hsl(325, 80%, 45%)';
      default: return 'var(--text-muted)';
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Release Hero Section */}
      <div className="card" style={{
        background: 'linear-gradient(135deg, hsl(215, 25%, 15%), hsl(220, 20%, 25%))',
        color: 'var(--text-white)',
        border: 'none',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '24px'
      }}>
        <div style={{ flex: '1', minWidth: '300px' }}>
          <span className="tag" style={{ backgroundColor: 'var(--primary)', color: 'white', marginBottom: '12px' }}>
            Active Release
          </span>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: '8px' }}>
            Thai Medicines Terminology (TMT)
          </h2>
          <p style={{ color: 'hsl(210, 10%, 80%)', fontSize: '0.95rem', maxWidth: '600px' }}>
            ระบบบัญชีข้อมูลรายการยาและรหัสยามาตรฐานไทย โดย Little-Ong สำหรับโรงพยาบาลสมเด็จพระยุพราชสายบุรี
          </p>
        </div>

        <div style={{ display: 'flex', gap: '16px' }}>
          <div style={{ background: 'rgba(255,255,255,0.06)', padding: '16px 20px', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <p style={{ fontSize: '0.75rem', color: 'hsl(210, 10%, 70%)', fontWeight: 600 }}>เวอร์ชันเผยแพร่</p>
            <p style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--secondary)', fontFamily: 'var(--font-mono)' }}>
              {meta?.version || 'TMTRF20260803'}
            </p>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.06)', padding: '16px 20px', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <p style={{ fontSize: '0.75rem', color: 'hsl(210, 10%, 70%)', fontWeight: 600 }}>วันที่เผยแพร่</p>
            <p style={{ fontSize: '1.4rem', fontWeight: 800, color: 'white' }}>
              {meta?.releaseDate || '3 ส.ค. 2569'}
            </p>
          </div>
        </div>
      </div>

      {/* Metrics Section */}
      <div>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Database className="w-5 h-5 text-primary" /> จำนวนแนวคิดยาในระบบแยกตามระดับ (TMT Concepts)
        </h3>
        <div className="metrics-grid">
          {meta && Object.entries(meta.conceptCounts).map(([type, count]) => (
            <div className="metric-card" key={type} style={{ borderLeft: `4px solid ${getLevelColor(type)}` }}>
              <div style={{ flex: 1 }}>
                <p className="metric-label">{levelDescriptions[type] || type}</p>
                <p className="metric-value" style={{ color: getLevelColor(type), marginTop: '4px' }}>
                  {count.toLocaleString()}
                </p>
              </div>
              <span className={`tag type-${type}`} style={{ position: 'absolute', right: '16px', top: '16px' }}>
                {type}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Database Statistics */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        
        {/* Core Features Cards */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--primary)' }}>
            สถิติการเชื่อมโยงโครงสร้างรหัสยา
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: 'var(--bg-app)', borderRadius: 'var(--radius-sm)' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 550 }}>จำนวนคอนเซปต์ทั้งหมด (Total Concepts)</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                {meta?.totalConcepts.toLocaleString()} รายการ
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: 'var(--bg-app)', borderRadius: 'var(--radius-sm)' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 550 }}>ความสัมพันธ์รวม (Total Relations)</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                {meta?.totalRelations.toLocaleString()} รูปแบบ
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: 'var(--bg-app)', borderRadius: 'var(--radius-sm)' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 550 }}>สถานะฐานข้อมูลระบบ</span>
              <span style={{ color: 'var(--secondary)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                <CheckCircle className="w-4 h-4" /> พร้อมใช้งาน (100% Real Data)
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '12px', marginTop: 'auto' }}>
            <button className="btn btn-primary" onClick={() => onNavigate('TRANSLATOR')} style={{ flex: 1 }}>
              เครื่องมือแปลงรหัสยา
            </button>
            <button className="btn btn-secondary" onClick={() => onNavigate('BROWSER')} style={{ flex: 1 }}>
              ค้นหาแนวคิดยา TMT
            </button>
          </div>
        </div>

        {/* Release Note summary */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText className="w-5 h-5 text-primary" /> สรุปข้อมูล TMT Release Note
          </h3>
          <ul style={{ paddingLeft: '20px', fontSize: '0.88rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <li>รองรับยาที่มีมูลค่าสูง 9 กลุ่มหลัก ตรวจสอบเกณฑ์การเบิกจ่ายชดเชยระดับชาติ (NPC = Non-essential drug Prescription Criteria)</li>
            <li>ไฟล์หลักสำหรับอ้างอิงรหัสยาที่เปิดใช้งานอยู่จริง (Active): <strong>TMTRF20260803_SNAPSHOT.xls</strong> (34,355 รายการระดับ TPU)</li>
            <li>ไฟล์ประวัติการเปลี่ยนแปลงและการแก้ไขทั้งหมด: <strong>TMTRF20260803_FULL.xls</strong></li>
            <li>เพิ่มการตรวจสอบการเคลื่อนไหวของข้อมูลรอบล่าสุด (DELTA): เพิ่มเติมรายการยาใหม่ 20 รายการ (Worksheet ADD) และไม่มีรายการยกเลิก (REJECT) หรือทดแทน (DEPRECATE) ในรอบนี้</li>
          </ul>
        </div>

      </div>

    </div>
  );
};
