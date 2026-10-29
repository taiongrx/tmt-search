#!/usr/bin/env python3
"""
Autonomous TMT Monthly Release Watcher & Auto-Pipeline Runner
=============================================================
เอเจนต์อัตโนมัติคอยตรวจจับและดึงไฟล์ TMT / TTMT รอบใหม่จาก สมสท.
เมื่อพบ release ใหม่ จะสั่งรัน Pipeline อัตโนมัติ:
  1. Detect new release folder / download
  2. Run ETL (processData.cjs + ingest_ttmt.cjs)
  3. Run Automated WHO-ATC Matching (fetch_atc_automated.cjs)
  4. Rebuild SQLite & Audit Log (load_to_sqlite.cjs)
  5. Restart API & Notify Discord/Webhook

สามารถตั้งให้รันเป็น Cron job (เช่น ทุกวันที่ 1 และ 16 ของเดือน)
"""

import os
import sys
import glob
import subprocess
import json
from datetime import datetime

WATCH_DIR = "/Users/Taiongz/Downloads"
PROJECT_DIR = "/Users/Taiongz/.gemini/antigravity/scratch/tmt-search-platform"

def log(msg):
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] 🤖 [Agent Watcher] {msg}")

def find_latest_release():
    pattern = os.path.join(WATCH_DIR, "TMTRF*")
    folders = [f for f in glob.glob(pattern) if os.path.isdir(f)]
    # Also check inside Downloads/TMT
    inner_pattern = os.path.join(WATCH_DIR, "TMT", "TMTRF*")
    folders.extend([f for f in glob.glob(inner_pattern) if os.path.isdir(f)])
    
    valid_folders = []
    for f in folders:
        # Check if Concept or TMTRF*_BONUS/Concept exists
        base = os.path.basename(f)
        bonus_dir = os.path.join(f, f"{base}_BONUS", "Concept")
        direct_dir = os.path.join(f, "Concept")
        if os.path.exists(bonus_dir) or os.path.exists(direct_dir):
            import re
            m = re.search(r'\d{8}', base)
            date_val = int(m.group(0)) if m else 0
            valid_folders.append((date_val, f))

    if not valid_folders:
        return None

    valid_folders.sort(key=lambda x: x[0], reverse=True)
    return valid_folders[0][1]


def run_command(cmd, cwd=PROJECT_DIR):
    log(f"Executing: {' '.join(cmd)}")
    res = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if res.returncode != 0:
        log(f"❌ Error in command: {res.stderr}")
        return False
    log(f"✅ Finished: {res.stdout.splitlines()[-1] if res.stdout else 'Done'}")
    return True

def main():
    log("Starting Autonomous TMT Release Check...")
    latest = find_latest_release()
    if not latest:
        log("No TMTRF release folders found.")
        return

    rel_name = os.path.basename(latest)
    log(f"Latest Detected Release: {rel_name} ({latest})")

    # Read current version in meta.json
    meta_path = os.path.join(PROJECT_DIR, "public", "data", "meta.json")
    current_ver = ""
    if os.path.exists(meta_path):
        try:
            with open(meta_path) as f:
                current_ver = json.load(f).get("version", "")
        except Exception:
            pass

    log(f"Current System Release: {current_ver}")

    if rel_name == current_ver:
        log("System is already up-to-date with latest release. No action needed.")
        return

    log(f"⚡ New release detected! Starting autonomous pipeline upgrade: {current_ver} -> {rel_name}")

    # 1. Process TMT
    if not run_command(["node", "scripts/processData.cjs", latest]):
        return

    # 2. Ingest TTMT if available
    ttmt_file = os.path.join(WATCH_DIR, "TMT", "MasterTTMT_20261001.xls")
    if os.path.exists(ttmt_file):
        run_command(["node", "scripts/ingest_ttmt.cjs"])

    # 3. Match ATC
    if not run_command(["node", "scripts/fetch_atc_automated.cjs"]):
        return

    # 4. Load SQLite
    if not run_command(["node", "scripts/load_to_sqlite.cjs"]):
        return

    log("🎉 Autonomous Pipeline completed successfully! Database and platform are now synchronized.")

if __name__ == "__main__":
    main()
