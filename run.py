"""
run.py — จุดเริ่มทำงานหลัก (entry point)

ลำดับการทำงาน:
  1. วิเคราะห์หุ้นทุกตัวใน watchlist
  2. ประเมินภาวะตลาด (regime) + คำนวณขนาดไม้ (position sizing)
  3. เทียบกับรอบก่อนเพื่อหา "สิ่งที่เปลี่ยน" (กันสแปม)
  4. บันทึก paper trade + คำนวณผลจริง
  5. เขียน signals.json ให้ dashboard
  6. แจ้งเตือน Telegram เฉพาะสัญญาณใหม่/หลุด + heartbeat
  ถ้ามี error ที่ไม่คาดคิด -> แจ้งเตือนความล้มเหลวทาง Telegram

รันด้วย:  python run.py
"""
from __future__ import annotations

import json
import os
import traceback
from datetime import datetime, timezone, timedelta

import config
import market
import notifier
import state
import tracker
from analyzer import analyze_watchlist

ICT = timezone(timedelta(hours=7))
ROOT = os.path.dirname(os.path.abspath(__file__))
OUTPUT_PATH = os.path.join(ROOT, "docs", "data", "signals.json")

BUY_TIER = ("BUY", "STRONG BUY")


def _attach_position_sizing(signals: list[dict]) -> None:
    for s in signals:
        if s["signal"] in BUY_TIER:
            ps = market.position_size(s["entry"], s["stop_loss"])
            s["pos_shares"] = ps["shares"]
            s["pos_value"] = ps["value"]


def run_pipeline() -> None:
    now = datetime.now(ICT)
    generated_at = now.strftime("%Y-%m-%d %H:%M") + " (เวลาไทย)"
    date_str = now.strftime("%Y-%m-%d")

    print("=" * 60)
    print(f"AI Stock Signal — เริ่มวิเคราะห์ {generated_at}")
    print("=" * 60)

    signals = analyze_watchlist(config.WATCHLIST)

    attempted = len(config.WATCHLIST)
    fail_ratio = (1 - len(signals) / attempted) if attempted else 0.0

    # ภาวะตลาด + ขนาดไม้
    regime = market.assess_regime(signals) if config.REGIME_ENABLED else None
    _attach_position_sizing(signals)

    # หาสิ่งที่เปลี่ยนเทียบรอบก่อน (กันสแปม)
    prev = state.load_state()
    if config.ALERT_ONLY_CHANGES:
        changes = state.diff_signals(signals, prev)
    else:
        changes = [{**s, "change": "NEW"} for s in signals if s["signal"] in BUY_TIER]

    # paper trading + ผลจริง
    perf = None
    if config.TRACKER_ENABLED:
        perf = tracker.update_and_log(signals, changes, generated_at, date_str)

    # เขียนผลลัพธ์สำหรับ dashboard
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
        "regime": regime,
        "notify_min_score": market.notify_min_score(regime),
        "account_size": config.ACCOUNT_SIZE,
        "risk_per_trade_pct": config.RISK_PER_TRADE_PCT * 100,
        "fetch_fail_ratio": round(fail_ratio, 3),
        "signals": signals,
    }
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print(f"\nบันทึก {len(signals)} ตัว -> {OUTPUT_PATH}")
    print(f"สรุป: STRONG BUY={summary['strong_buy']} | BUY={summary['buy']} "
          f"| WATCH={summary['watch']} | AVOID={summary['avoid']}")
    if regime:
        print(f"ภาวะตลาด: {regime['label']} (breadth {regime['breadth']}%)")
    print(f"การเปลี่ยนแปลงที่จะแจ้ง: {len(changes)} รายการ")

    # แจ้งเตือน
    min_score = market.notify_min_score(regime)
    message = notifier.build_change_message(changes, regime, generated_at, min_score, fail_ratio, perf)
    notifier.send_telegram(message)

    # บันทึก state ไว้เทียบรอบหน้า (ทำหลังคำนวณ diff แล้ว)
    state.save_state(signals, generated_at)

    print("\nเสร็จสิ้น ✅")


def main() -> None:
    try:
        run_pipeline()
    except Exception as e:  # ระบบล้ม -> แจ้งเตือนแล้วโยน error ต่อให้ workflow เห็น
        traceback.print_exc()
        try:
            notifier.send_failure(f"{type(e).__name__}: {e}")
        except Exception:
            pass
        raise


if __name__ == "__main__":
    main()
