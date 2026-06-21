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
import news
import notifier
import state
import tracker
from analyzer import analyze_watchlist

ICT = timezone(timedelta(hours=7))
ROOT = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(ROOT, "docs", "data")
STATUS_PATH = os.path.join(DATA_DIR, "status.json")

BUY_TIER = ("BUY", "STRONG BUY")


def _display_ticker(ticker: str) -> str:
    return ticker[:-3] if ticker.endswith(".BK") else ticker


def _write_universe(generated_at: str, now: datetime) -> None:
    """เขียนรายชื่อหุ้นทั้งหมดใน watchlist ให้หน้าเว็บใช้ค้นหา."""
    stocks = []
    markets = []
    for mkey, m in config.MARKETS.items():
        markets.append({
            "key": mkey,
            "name": m["name"],
            "short": m["short"],
            "tag": m["tag"],
            "count": len(m["watchlist"]),
        })
        for ticker, name in m["watchlist"].items():
            stocks.append({
                "ticker": ticker,
                "display_ticker": _display_ticker(ticker),
                "name": name,
                "market_key": mkey,
                "market": m["short"],
                "market_tag": m["tag"],
                "currency": m["currency"],
            })
    stocks.sort(key=lambda x: (x["market_key"], x["display_ticker"]))
    payload = {
        "generated_at": generated_at,
        "generated_at_iso": now.isoformat(),
        "count": len(stocks),
        "markets": markets,
        "stocks": stocks,
    }
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(os.path.join(DATA_DIR, "universe.json"), "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print(f"  บันทึกรายชื่อหุ้นสำหรับค้นหา -> universe.json ({len(stocks)} ตัว)")


def _process_market(mkey: str, m: dict, generated_at: str, now) -> tuple:
    """วิเคราะห์ 1 หมวด → เขียนไฟล์ dashboard → คืน (signals, regime, fail_ratio, status)"""
    print(f"\n--- หมวด: {m['name']} ({len(m['watchlist'])} ตัว) ---")
    signals = analyze_watchlist(m["watchlist"])
    attempted = len(m["watchlist"])
    fail_ratio = (1 - len(signals) / attempted) if attempted else 0.0

    regime = market.assess_regime(signals) if config.REGIME_ENABLED else None

    for s in signals:
        s["market"] = m["short"]
        s["market_tag"] = m["tag"]
        s["currency"] = m["currency"]
        if s["signal"] in BUY_TIER:
            ps = market.position_size(s["entry"], s["stop_loss"])
            s["pos_shares"] = ps["shares"]
            s["pos_value"] = ps["value"]

    if config.NEWS_ENABLED:
        news.attach_news(signals)

    summary = {
        "strong_buy": sum(1 for s in signals if s["signal"] == "STRONG BUY"),
        "buy": sum(1 for s in signals if s["signal"] == "BUY"),
        "watch": sum(1 for s in signals if s["signal"] == "WATCH"),
        "avoid": sum(1 for s in signals if s["signal"] == "AVOID"),
    }
    payload = {
        "generated_at": generated_at,
        "generated_at_iso": now.isoformat(),
        "market_key": mkey,
        "market_name": m["name"],
        "currency": m["currency"],
        "count": len(signals),
        "summary": summary,
        "regime": regime,
        "notify_min_score": market.notify_min_score(regime),
        "account_size": config.ACCOUNT_SIZE,
        "risk_per_trade_pct": config.RISK_PER_TRADE_PCT * 100,
        "fetch_fail_ratio": round(fail_ratio, 3),
        "signals": signals,
    }
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(os.path.join(DATA_DIR, m["file"]), "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print(f"  บันทึก {len(signals)} ตัว -> {m['file']} "
          f"(STRONG BUY={summary['strong_buy']} BUY={summary['buy']} "
          f"WATCH={summary['watch']} AVOID={summary['avoid']})")
    if regime:
        print(f"  ภาวะตลาด: {regime['label']} (breadth {regime['breadth']}%)")
    status = {
        "key": mkey,
        "name": m["name"],
        "short": m["short"],
        "tag": m["tag"],
        "file": m["file"],
        "attempted": attempted,
        "received": len(signals),
        "failed": max(attempted - len(signals), 0),
        "fetch_fail_ratio": round(fail_ratio, 3),
        "summary": summary,
        "regime": regime,
    }
    return signals, regime, fail_ratio, status


def _write_status(generated_at: str, now, markets: list[dict],
                  worst_fail: float, telegram_status: str) -> None:
    attempted = sum(m["attempted"] for m in markets)
    received = sum(m["received"] for m in markets)
    failed = sum(m["failed"] for m in markets)
    warnings = []
    if worst_fail >= config.FETCH_FAIL_WARN_RATIO:
        warnings.append(
            f"ดึงข้อมูลล้มเหลวสูงสุด {worst_fail * 100:.0f}% "
            f"(เกณฑ์เตือน {config.FETCH_FAIL_WARN_RATIO * 100:.0f}%)"
        )
    for m in markets:
        if m["received"] == 0 and m["attempted"] > 0:
            warnings.append(f"{m['short']}: ไม่ได้ข้อมูลหุ้นเลย")

    payload = {
        "generated_at": generated_at,
        "generated_at_iso": now.isoformat(),
        "status": "warning" if warnings else "ok",
        "telegram": telegram_status,
        "overall": {
            "attempted": attempted,
            "received": received,
            "failed": failed,
            "fetch_fail_ratio": round((failed / attempted) if attempted else 0.0, 3),
        },
        "markets": markets,
        "warnings": warnings,
    }
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(STATUS_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print(f"  บันทึกสถานะระบบ -> {STATUS_PATH}")


def run_pipeline(notify_no_changes: bool = True, send_notification: bool = True) -> None:
    now = datetime.now(ICT)
    generated_at = now.strftime("%Y-%m-%d %H:%M") + " (เวลาไทย)"
    date_str = now.strftime("%Y-%m-%d")

    print("=" * 60)
    print(f"AI Stock Signal — เริ่มวิเคราะห์ {generated_at}")
    print("=" * 60)
    _write_universe(generated_at, now)

    all_signals: list[dict] = []
    regimes: list[dict] = []
    market_statuses: list[dict] = []
    market_min: dict = {}
    worst_fail = 0.0
    for mkey, m in config.MARKETS.items():
        sigs, regime, fail_ratio, status = _process_market(mkey, m, generated_at, now)
        all_signals += sigs
        market_statuses.append(status)
        worst_fail = max(worst_fail, fail_ratio)
        market_min[m["tag"]] = market.notify_min_score(regime)
        if regime:
            regimes.append({**regime, "short": m["short"]})

    # หาสิ่งที่เปลี่ยน (รวมทุกหมวด — ticker ไม่ซ้ำกันข้ามตลาด)
    prev = state.load_state()
    if config.ALERT_ONLY_CHANGES:
        changes = state.diff_signals(all_signals, prev)
    else:
        changes = [{**s, "change": "NEW"} for s in all_signals if s["signal"] in BUY_TIER]
    for c in changes:
        c["min_score"] = market_min.get(c.get("market_tag"), config.NOTIFY_MIN_SCORE)

    # paper trading + ผลจริง (รวมทุกหมวด)
    perf = None
    if config.TRACKER_ENABLED:
        perf = tracker.update_and_log(all_signals, changes, generated_at, date_str)

    print(f"\nการเปลี่ยนแปลงที่จะแจ้ง: {len(changes)} รายการ")

    # แจ้งเตือน — ส่งเฉพาะเมื่อมีการเปลี่ยนแปลงจริง (กันสแปมตอนรันถี่ๆ)
    message = notifier.build_change_message(changes, regimes, generated_at, worst_fail, perf)
    notifiable = [c for c in changes
                  if (c.get("change") in ("NEW", "UPGRADE")
                      and c.get("score", 0) >= c.get("min_score", config.NOTIFY_MIN_SCORE))
                  or c.get("change") == "EXIT"]
    data_problem = worst_fail >= config.FETCH_FAIL_WARN_RATIO
    telegram_status = "skipped"
    if not send_notification:
        telegram_status = "skipped_by_command"
        print("  ข้ามการส่ง Telegram notification — เรียกจากคำสั่งที่มีข้อความตอบกลับเอง")
    elif notifiable or notify_no_changes or data_problem:
        telegram_status = "sent" if notifier.send_telegram(message) else "failed_or_not_configured"
    else:
        print("  ไม่มีสัญญาณใหม่ — ข้ามการแจ้งเตือน Telegram (กันสแปม)")

    state.save_state(all_signals, generated_at)
    _write_status(generated_at, now, market_statuses, worst_fail, telegram_status)
    print("\nเสร็จสิ้น ✅")


def main() -> None:
    try:
        notify_no_changes = os.getenv("NOTIFY_NO_CHANGES", "true").strip().lower() not in ("0", "false", "no", "off")
        run_pipeline(notify_no_changes=notify_no_changes)
    except Exception as e:  # ระบบล้ม -> แจ้งเตือนแล้วโยน error ต่อให้ workflow เห็น
        traceback.print_exc()
        try:
            notifier.send_failure(f"{type(e).__name__}: {e}")
        except Exception:
            pass
        raise


if __name__ == "__main__":
    main()
