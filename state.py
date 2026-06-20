"""
state.py — จำสถานะสัญญาณรอบก่อน เพื่อแจ้งเฉพาะสิ่งที่ "เปลี่ยน" (กันสแปม)

ประเภทการเปลี่ยนแปลงที่ถือว่าควรแจ้ง:
  NEW      — เพิ่งเข้าเงื่อนไขซื้อ (จากเดิมไม่ใช่ BUY/STRONG BUY)
  UPGRADE  — ยกระดับจาก BUY -> STRONG BUY
  EXIT     — เดิมเป็นสัญญาณซื้อ แต่รอบนี้หลุดลงต่ำกว่า (ควรพิจารณาขาย/ออก)
"""
from __future__ import annotations

import json
import os

import config

ROOT = os.path.dirname(os.path.abspath(__file__))
STATE_PATH = os.path.join(ROOT, config.STATE_DIR, "alert_state.json")

TIER_RANK = {"AVOID": 0, "WATCH": 1, "BUY": 2, "STRONG BUY": 3}
BUY_TIER = 2  # คะแนนระดับที่ถือว่าเป็น "สัญญาณซื้อ"


def load_state() -> dict:
    try:
        with open(STATE_PATH, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"last_run": None, "signals": {}}


def save_state(signals: list[dict], generated_at: str) -> None:
    os.makedirs(os.path.dirname(STATE_PATH), exist_ok=True)
    data = {
        "last_run": generated_at,
        "signals": {s["ticker"]: {"signal": s["signal"], "score": s["score"]} for s in signals},
    }
    with open(STATE_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def diff_signals(current: list[dict], prev_state: dict) -> list[dict]:
    """คืนรายการการเปลี่ยนแปลงที่ควรแจ้งเตือน (ติด field 'change')"""
    prev = prev_state.get("signals", {})
    cur_by = {s["ticker"]: s for s in current}
    changes: list[dict] = []

    for s in current:
        tk = s["ticker"]
        cur_tier = TIER_RANK.get(s["signal"], 0)
        p = prev.get(tk)
        prev_tier = TIER_RANK.get(p["signal"], 0) if p else 0
        if cur_tier >= BUY_TIER and prev_tier < BUY_TIER:
            changes.append({**s, "change": "NEW"})
        elif s["signal"] == "STRONG BUY" and p and p["signal"] == "BUY":
            changes.append({**s, "change": "UPGRADE"})

    # ตรวจสัญญาณที่ "หลุด" จากระดับซื้อ
    for tk, p in prev.items():
        if TIER_RANK.get(p["signal"], 0) >= BUY_TIER:
            cs = cur_by.get(tk)
            if cs is None or TIER_RANK.get(cs["signal"], 0) < BUY_TIER:
                base = cs or {"ticker": tk, "name": tk, "signal": "—", "score": 0, "price": None}
                changes.append({**base, "change": "EXIT", "prev_signal": p["signal"]})

    return changes
