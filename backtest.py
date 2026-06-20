"""
backtest.py — ทดสอบย้อนหลัง (Backtest)

ตอบคำถาม: "ถ้าในอดีตเราเดินตามสัญญาณของระบบนี้ ผลจะเป็นยังไง?"

วิธีจำลอง (กฎง่ายๆ โปร่งใส):
  • เข้าซื้อ: วันที่คะแนนสัญญาณ >= BACKTEST_ENTRY_SCORE (ราคาปิดวันนั้น)
  • ออก: ชน target (+TARGET1_PCT) → กำไร | ชน stop (-STOP_LOSS_PCT) → ขาดทุน
           | ถือครบ BACKTEST_MAX_HOLD วัน → ปิดที่ราคาปิด
  • ถือทีละ 1 โพซิชั่นต่อหุ้น (ปิดก่อนจึงเข้าใหม่)

⚠️ ข้อจำกัดที่ต้องเข้าใจ:
  - ผลในอดีต "ไม่การันตี" อนาคต
  - ยังไม่รวมค่าคอมมิชชั่น ภาษี และ slippage (ของจริงจะได้น้อยกว่านี้)
  - เป็นการประเมินคร่าวๆ เพื่อดู "นิสัย" ของกลยุทธ์ ไม่ใช่ผลตอบแทนรับประกัน

รัน:  python backtest.py
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone, timedelta

import pandas as pd

import config
from analyzer import compute_indicators, fetch_history, score_point, _safe

ICT = timezone(timedelta(hours=7))
ROOT = os.path.dirname(os.path.abspath(__file__))
OUTPUT_PATH = os.path.join(ROOT, "docs", "data", "backtest.json")


def _daily_scores(ind: pd.DataFrame) -> list[float]:
    """คำนวณคะแนนสัญญาณของทุกวัน (ใช้เฉพาะข้อมูลถึงวันนั้น — ไม่มองอนาคต)"""
    n = len(ind)
    scores = [0.0] * n
    c = ind["close"].values
    ef = ind["ema_fast"].values
    es = ind["ema_slow"].values
    rs = ind["rsi"].values
    mh = ind["macd_hist"].values
    vol = ind["vol"].values
    vavg = ind["vol_avg"].values
    mom = ind["mom5"].values
    for i in range(1, n):
        if pd.isna(es[i]) or pd.isna(vavg[i]):
            continue
        vr = (vol[i] / vavg[i]) if vavg[i] else 1.0
        sc, _, _, _, _ = score_point(
            _safe(c[i]), _safe(c[i - 1], c[i]), _safe(ef[i]), _safe(es[i]),
            _safe(rs[i], 50.0), _safe(mh[i]), _safe(mh[i - 1]),
            vr, _safe(mom[i]), with_text=False,
        )
        scores[i] = sc
    return scores


def backtest_one(ticker: str, name: str) -> dict | None:
    df = fetch_history(ticker, period=config.BACKTEST_PERIOD)
    if df is None or len(df) < config.EMA_SLOW + 30:
        return None

    ind = compute_indicators(df)
    scores = _daily_scores(ind)
    close = df["Close"].values
    high = df["High"].values
    low = df["Low"].values
    n = len(df)

    entry_score = config.BACKTEST_ENTRY_SCORE
    max_hold = config.BACKTEST_MAX_HOLD
    sl = config.STOP_LOSS_PCT
    tp = config.TARGET1_PCT

    trades: list[dict] = []
    i = config.EMA_SLOW + 5  # warmup ให้อินดิเคเตอร์นิ่งก่อน
    while i < n - 1:
        if scores[i] >= entry_score:
            entry = close[i]
            stop = entry * (1 - sl)
            target = entry * (1 + tp)
            exit_price, reason, exit_idx = None, None, None
            for j in range(i + 1, min(i + 1 + max_hold, n)):
                if low[j] <= stop:            # ชน stop ก่อน (สมมติแย่สุด)
                    exit_price, reason, exit_idx = stop, "stop", j
                    break
                if high[j] >= target:         # ชนเป้า
                    exit_price, reason, exit_idx = target, "target", j
                    break
            if exit_price is None:            # ถือครบเวลา
                exit_idx = min(i + max_hold, n - 1)
                exit_price, reason = close[exit_idx], "time"
            # หักต้นทุนไป-กลับ (ค่าคอม+VAT+slippage) ให้สมจริง
            ret = (exit_price - entry) / entry * 100 - config.COST_ROUNDTRIP_PCT * 100
            trades.append({"ret": ret, "reason": reason, "hold": exit_idx - i})
            i = exit_idx + 1                  # เข้าใหม่หลังปิดโพซิชั่นเดิม
        else:
            i += 1

    if not trades:
        return {
            "ticker": ticker, "name": name, "trades": 0, "win_rate": 0.0,
            "avg_return": 0.0, "total_return": 0.0, "best": 0.0, "worst": 0.0,
            "avg_hold": 0.0,
        }

    rets = [t["ret"] for t in trades]
    wins = [r for r in rets if r > 0]
    comp = 1.0
    for r in rets:
        comp *= (1 + r / 100)

    return {
        "ticker": ticker,
        "name": name,
        "trades": len(trades),
        "win_rate": round(len(wins) / len(trades) * 100, 1),
        "avg_return": round(sum(rets) / len(rets), 2),
        "total_return": round((comp - 1) * 100, 1),
        "best": round(max(rets), 2),
        "worst": round(min(rets), 2),
        "avg_hold": round(sum(t["hold"] for t in trades) / len(trades), 1),
    }


def run_backtest(watchlist: dict | None = None) -> dict:
    watchlist = watchlist or config.WATCHLIST
    now = datetime.now(ICT)
    results: list[dict] = []
    for ticker, name in watchlist.items():
        print(f"  backtest {name} ({ticker}) ...")
        try:
            r = backtest_one(ticker, name)
        except Exception as e:
            print(f"  [error] {ticker}: {e}")
            r = None
        if r:
            results.append(r)

    # สรุปรวมทั้งพอร์ต (ถ่วงตามจำนวนเทรด)
    total_trades = sum(r["trades"] for r in results)
    total_wins = sum(round(r["win_rate"] / 100 * r["trades"]) for r in results)
    all_avg = (
        sum(r["avg_return"] * r["trades"] for r in results) / total_trades
        if total_trades else 0.0
    )
    overall = {
        "total_trades": total_trades,
        "overall_win_rate": round(total_wins / total_trades * 100, 1) if total_trades else 0.0,
        "avg_return_per_trade": round(all_avg, 2),
        "stocks_tested": len(results),
    }

    results.sort(key=lambda x: x["total_return"], reverse=True)
    payload = {
        "generated_at": now.strftime("%Y-%m-%d %H:%M") + " (เวลาไทย)",
        "period": config.BACKTEST_PERIOD,
        "entry_score": config.BACKTEST_ENTRY_SCORE,
        "max_hold_days": config.BACKTEST_MAX_HOLD,
        "stop_loss_pct": config.STOP_LOSS_PCT * 100,
        "target_pct": config.TARGET1_PCT * 100,
        "cost_roundtrip_pct": config.COST_ROUNDTRIP_PCT * 100,
        "caveat": "หักต้นทุนไป-กลับแล้ว · ทดสอบบนหุ้นในลิสต์ปัจจุบัน (มี survivorship bias) · อดีตไม่การันตีอนาคต",
        "overall": overall,
        "results": results,
    }
    return payload


def main() -> None:
    print("=" * 60)
    print("AI Stock Signal — Backtest (ทดสอบย้อนหลัง)")
    print("=" * 60)
    payload = run_backtest(config.WATCHLIST_ALL)

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    o = payload["overall"]
    print("\n" + "=" * 60)
    print(f"สรุปผล backtest ({payload['period']}, เข้าที่คะแนน>={payload['entry_score']}):")
    print(f"  ทดสอบ {o['stocks_tested']} หุ้น · เทรดทั้งหมด {o['total_trades']} ครั้ง")
    print(f"  อัตราชนะรวม: {o['overall_win_rate']}%")
    print(f"  กำไรเฉลี่ยต่อเทรด: {o['avg_return_per_trade']}%")
    print(f"\nบันทึก -> {OUTPUT_PATH}")
    print("\n⚠️ ผลในอดีตไม่การันตีอนาคต และยังไม่รวมค่าคอมมิชชั่น/ภาษี/slippage")


if __name__ == "__main__":
    main()
