"""
tracker.py — ตัววัดผล "จริง" (Paper Trading)

บันทึกทุกสัญญาณซื้อใหม่เป็น paper position แล้วติดตามจนปิด เพื่อวัดว่า
ระบบ "แม่นจริงกี่ %" ในการใช้งานจริง (ต่างจาก backtest ที่เป็นอดีต)

กฎปิดสถานะ (อิงราคาปิดรายวัน + หักต้นทุน):
  ราคา >= เป้า   -> ปิดกำไร (target)
  ราคา <= ตัดขาดทุน -> ปิดขาดทุน (stop)
  ถือครบ TRACKER_MAX_HOLD วัน -> ปิดที่ราคาปัจจุบัน (time)

⚠️ เป็นการจำลองบนกระดาษ (ไม่ใช่เงินจริง) เพื่อตรวจสอบระบบ ไม่ใช่การรับประกันผล
"""
from __future__ import annotations

import json
import os

import config

ROOT = os.path.dirname(os.path.abspath(__file__))
LOG_PATH = os.path.join(ROOT, config.STATE_DIR, "signal_log.json")
PERF_PATH = os.path.join(ROOT, "docs", "data", "performance.json")

COST = config.COST_ROUNDTRIP_PCT * 100  # เป็น %


def load_log() -> dict:
    try:
        with open(LOG_PATH, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"positions": []}


def save_log(log: dict) -> None:
    os.makedirs(os.path.dirname(LOG_PATH), exist_ok=True)
    with open(LOG_PATH, "w", encoding="utf-8") as f:
        json.dump(log, f, ensure_ascii=False, indent=2)


def _close(pos: dict, price: float, reason: str, date_str: str) -> None:
    pos["status"] = "closed"
    pos["exit"] = round(price, 2)
    pos["exit_date"] = date_str
    pos["reason"] = reason
    pos["return_pct"] = round((price - pos["entry"]) / pos["entry"] * 100 - COST, 2)


def update_and_log(signals: list[dict], changes: list[dict],
                   generated_at: str, date_str: str) -> dict:
    log = load_log()
    positions = log["positions"]
    price_by = {s["ticker"]: s for s in signals}

    # 1) อัปเดตสถานะที่ยังเปิดอยู่
    for pos in positions:
        if pos.get("status") != "open":
            continue
        cur = price_by.get(pos["ticker"])
        if not cur:
            continue
        price = cur["price"]
        # นับวันถือเพิ่มเฉพาะเมื่อข้ามวันใหม่ (กันรันหลายครั้งต่อวัน)
        if pos.get("last_date") != date_str:
            pos["days"] = pos.get("days", 0) + 1
            pos["last_date"] = date_str
        if price >= pos["target"]:
            _close(pos, pos["target"], "target", date_str)
        elif price <= pos["stop"]:
            _close(pos, pos["stop"], "stop", date_str)
        elif pos["days"] >= config.TRACKER_MAX_HOLD:
            _close(pos, price, "time", date_str)

    # 2) เปิด paper position ใหม่จากสัญญาณ NEW (ไม่เปิดซ้ำตัวที่ยังถืออยู่)
    open_tickers = {p["ticker"] for p in positions if p.get("status") == "open"}
    for c in changes:
        if c.get("change") == "NEW" and c["ticker"] not in open_tickers and c.get("price"):
            positions.append({
                "ticker": c["ticker"], "name": c["name"],
                "signal": c["signal"], "score": c["score"],
                "entry_date": date_str, "entry": c["price"],
                "stop": c["stop_loss"], "target": c["target1"],
                "status": "open", "days": 0, "last_date": date_str,
                "exit": None, "exit_date": None, "reason": None, "return_pct": None,
            })
            open_tickers.add(c["ticker"])

    save_log(log)
    perf = compute_performance(positions, generated_at)
    _save_perf(perf)
    return perf


def compute_performance(positions: list[dict], generated_at: str) -> dict:
    closed = [p for p in positions if p.get("status") == "closed"]
    open_pos = [p for p in positions if p.get("status") == "open"]
    rets = [p["return_pct"] for p in closed if p.get("return_pct") is not None]
    wins = [r for r in rets if r > 0]

    comp = 1.0
    for r in rets:
        comp *= (1 + r / 100)

    summary = {
        "closed": len(closed),
        "open": len(open_pos),
        "win_rate": round(len(wins) / len(rets) * 100, 1) if rets else 0.0,
        "avg_return": round(sum(rets) / len(rets), 2) if rets else 0.0,
        "total_return": round((comp - 1) * 100, 1) if rets else 0.0,
        "by_target": sum(1 for p in closed if p.get("reason") == "target"),
        "by_stop": sum(1 for p in closed if p.get("reason") == "stop"),
        "by_time": sum(1 for p in closed if p.get("reason") == "time"),
    }
    return {
        "generated_at": generated_at,
        "cost_roundtrip_pct": config.COST_ROUNDTRIP_PCT * 100,
        "summary": summary,
        "open_positions": sorted(open_pos, key=lambda p: p.get("entry_date", ""), reverse=True),
        "closed_positions": sorted(closed, key=lambda p: p.get("exit_date") or "", reverse=True)[:30],
    }


def _save_perf(perf: dict) -> None:
    os.makedirs(os.path.dirname(PERF_PATH), exist_ok=True)
    with open(PERF_PATH, "w", encoding="utf-8") as f:
        json.dump(perf, f, ensure_ascii=False, indent=2)
