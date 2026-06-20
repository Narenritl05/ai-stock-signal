"""
run.py — จุดเริ่มทำงานหลัก (entry point)

ขั้นตอน:
  1. วิเคราะห์หุ้นทุกตัวใน watchlist
  2. เขียนผลลัพธ์ลง docs/data/signals.json (ให้เว็บ dashboard อ่าน)
  3. ส่งแจ้งเตือน Telegram เฉพาะหุ้นที่ผ่านเกณฑ์

รันด้วย:  python run.py
GitHub Actions จะเรียกไฟล์นี้ตามเวลาที่ตั้งไว้โดยอัตโนมัติ
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone, timedelta

import config
from analyzer import analyze_watchlist
from notifier import build_message, send_telegram

# เวลาไทย (UTC+7)
ICT = timezone(timedelta(hours=7))

ROOT = os.path.dirname(os.path.abspath(__file__))
OUTPUT_PATH = os.path.join(ROOT, "docs", "data", "signals.json")


def main() -> None:
    now = datetime.now(ICT)
    generated_at = now.strftime("%Y-%m-%d %H:%M") + " (เวลาไทย)"

    print("=" * 60)
    print(f"AI Stock Signal — เริ่มวิเคราะห์ {generated_at}")
    print("=" * 60)

    signals = analyze_watchlist(config.WATCHLIST)

    summary = {
        "strong_buy": sum(1 for s in signals if s["signal"] == "STRONG BUY"),
        "buy": sum(1 for s in signals if s["signal"] == "BUY"),
        "watch": sum(1 for s in signals if s["signal"] == "WATCH"),
        "avoid": sum(1 for s in signals if s["signal"] == "AVOID"),
    }

    payload = {
        "generated_at": generated_at,
        "generated_at_iso": now.isoformat(),
        "market": "SET (ตลาดหลักทรัพย์แห่งประเทศไทย)",
        "count": len(signals),
        "summary": summary,
        "notify_min_score": config.NOTIFY_MIN_SCORE,
        "signals": signals,
    }

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print(f"\nบันทึกผลลัพธ์ {len(signals)} ตัว -> {OUTPUT_PATH}")
    print(f"สรุป: STRONG BUY={summary['strong_buy']} | BUY={summary['buy']} "
          f"| WATCH={summary['watch']} | AVOID={summary['avoid']}")

    # ส่งแจ้งเตือน
    message = build_message(signals, generated_at, config.NOTIFY_MIN_SCORE)
    send_telegram(message)

    print("\nเสร็จสิ้น ✅")


if __name__ == "__main__":
    main()
