import React, { useState } from 'react';
import { 
  Copy, 
  Check, 
  Terminal, 
  Zap
} from 'lucide-react';


export const ApiDocsModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'PYTHON' | 'CURL' | 'JS'>('PYTHON');

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5050';
  const apiBase = currentOrigin.includes('localhost') ? 'http://localhost:5050' : currentOrigin;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.65)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '20px'
    }}>
      <div style={{
        background: 'var(--bg-card)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border)',
        width: '100%',
        maxWidth: '750px',
        maxHeight: '90vh',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: 'var(--shadow-lg)'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              background: 'var(--primary-light)',
              color: 'var(--primary)',
              padding: '8px',
              borderRadius: 'var(--radius-sm)'
            }}>
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>
                ศูนย์การเชื่อมต่อ TMT & ATC API (Integration Hub)
              </h3>
              <p className="text-muted" style={{ fontSize: '0.82rem' }}>
                สำหรับนักพัฒนาและผู้ดูแลระบบ รพ. นำไปเชื่อมต่อกับ HIS หรือโปรเจกต์อื่น
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="btn btn-secondary"
            style={{ padding: '6px 12px', fontSize: '0.85rem' }}
          >
            ปิด
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Base URL Box */}
          <div style={{
            background: 'var(--bg-app)',
            padding: '12px 16px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>API BASE URL</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.95rem', fontWeight: 700, color: 'var(--primary)' }}>
                {apiBase}
              </div>
            </div>
            <button
              onClick={() => copyToClipboard(apiBase, 'base_url')}
              className="btn btn-secondary"
              style={{ padding: '6px 12px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              {copiedKey === 'base_url' ? <Check className="w-3.5 h-3.5 text-secondary" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedKey === 'base_url' ? 'คัดลอกแล้ว' : 'คัดลอก URL'}
            </button>
          </div>

          {/* Endpoints Table */}
          <div>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Zap className="w-4 h-4 text-primary" /> รายการ Endpoints ที่พร้อมใช้งาน
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {[
                { method: 'GET', path: '/api/lookup/<tmt_code>', desc: 'แปลงรหัส TMT เป็น ATC Code (Graph Traversal อัตโนมัติ)' },
                { method: 'POST', path: '/api/batch', desc: 'แปลงหลายรหัสพร้อมกัน สูงสุด 500 รหัส (body: {"codes": [...]})' },
                { method: 'GET', path: '/api/search?q=<name>', desc: 'ค้นหายาด้วยชื่อไทย/อังกฤษ พร้อมดึงรหัส ATC' },
                { method: 'GET', path: '/api/atc/<atc_code>', desc: 'Reverse lookup: หายา TMT ทั้งหมดจากรหัส WHO-ATC' },
                { method: 'GET', path: '/api/stats', desc: 'สรุปสถิติจำนวนยา Concepts, Relations และ Mappings' },
              ].map((ep, idx) => (
                <div 
                  key={idx}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-app)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    fontSize: '0.82rem'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      background: ep.method === 'GET' ? 'hsl(160, 75%, 90%)' : 'hsl(215, 80%, 90%)',
                      color: ep.method === 'GET' ? 'hsl(160, 90%, 25%)' : 'hsl(215, 90%, 30%)',
                      fontSize: '0.7rem',
                      fontWeight: 800,
                      padding: '2px 6px',
                      borderRadius: '4px'
                    }}>
                      {ep.method}
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{ep.path}</span>
                  </div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{ep.desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Code Snippets Section */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 700 }}>ตัวอย่างโค้ดเรียกใช้งาน (Code Example)</h4>
              <div style={{ display: 'flex', gap: '4px' }}>
                {(['PYTHON', 'CURL', 'JS'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      padding: '4px 10px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid',
                      borderColor: activeTab === tab ? 'var(--primary)' : 'var(--border)',
                      background: activeTab === tab ? 'var(--primary)' : 'transparent',
                      color: activeTab === tab ? 'white' : 'var(--text-main)',
                      cursor: 'pointer'
                    }}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ position: 'relative' }}>
              <pre style={{
                background: 'hsl(220, 20%, 10%)',
                color: 'hsl(210, 20%, 90%)',
                padding: '16px',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.82rem',
                fontFamily: 'var(--font-mono)',
                overflowX: 'auto',
                lineHeight: '1.5'
              }}>
                {activeTab === 'PYTHON' && `import requests

# 1. แปลงรหัส TPU เดี่ยว
res = requests.get("${apiBase}/api/lookup/100014").json()
print("ATC Code:", res["primary_atc"]["atc_code"])

# 2. แปลงแบบ Batch
batch_res = requests.post("${apiBase}/api/batch", json={
    "codes": ["100014", "220295", "220305"]
}).json()
print(batch_res["results"])`}

                {activeTab === 'CURL' && `# แปลงรหัส TPU 100014
curl "${apiBase}/api/lookup/100014"

# ค้นหาด้วยชื่อยา
curl "${apiBase}/api/search?q=amoxicillin&limit=5"`}

                {activeTab === 'JS' && `// JavaScript Fetch
const res = await fetch("${apiBase}/api/lookup/100014");
const data = await res.json();
console.log("ATC Code:", data.primary_atc.atc_code);`}
              </pre>

              <button
                onClick={() => {
                  const code = activeTab === 'PYTHON' 
                    ? `import requests\nres = requests.get("${apiBase}/api/lookup/100014").json()\nprint(res["primary_atc"]["atc_code"])`
                    : activeTab === 'CURL'
                    ? `curl "${apiBase}/api/lookup/100014"`
                    : `const res = await fetch("${apiBase}/api/lookup/100014"); const data = await res.json();`;
                  copyToClipboard(code, 'code_snippet');
                }}
                className="btn btn-secondary"
                style={{
                  position: 'absolute',
                  top: '10px',
                  right: '10px',
                  padding: '4px 8px',
                  fontSize: '0.72rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                {copiedKey === 'code_snippet' ? <Check className="w-3 h-3 text-secondary" /> : <Copy className="w-3 h-3" />}
                {copiedKey === 'code_snippet' ? 'คัดลอกแล้ว' : 'คัดลอกโค้ด'}
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
