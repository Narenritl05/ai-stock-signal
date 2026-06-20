"""
telegram_digest.py — ส่งสรุปหุ้นเข้า Telegram ตามรอบเวลา GitHub Actions

อ่านจาก docs/data/*.json ที่ pipeline สร้างไว้แล้ว จึงไม่ต้องเปิดคอมและไม่ต้องดึงราคาใหม่
"""
from __future__ import annotations

import argparse
import html
import json
import os
from datetime import datetime, timezone, timedelta

import config
import notifier

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(ROOT, "docs", "data")
ICT = timezone(timedelta(hours=7))
BUY_SIGNALS = {"BUY", "STRONG BUY"}


def _load_json(name: str) -> dict | None:
    path = os.path.join(DATA_DIR, name)
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def _load_market_payloads() -> list[dict]:
    payloads = []
    for market in config.MARKETS.values():
        payload = _load_json(market["file"])
        if payload:
            payloads.append(payload)
    return payloads


def _signals() -> list[dict]:
    rows = []
    for payload in _load_market_payloads():
        for s in payload.get("signals", []):
            item = dict(s)
            item.setdefault("currency", payload.get("currency", ""))
            item.setdefault("market_name", payload.get("market_name", ""))
            rows.append(item)
    return rows


def _holding_label(s: dict) -> str:
    if s.get("holding_label"):
        return s["holding_label"]
    if s.get("signal") in BUY_SIGNALS:
        hot = s.get("momentum_5d", 0) >= 5 or s.get("volume_ratio", 0) >= 1.8 or s.get("rsi", 50) >= 70
        return "ถือสั้น" if hot else "ถือยาว"
    if s.get("signal") == "WATCH":
        return "รอดู"
    return "ไม่ควรถือ"


def _holding_period(s: dict) -> str:
    if s.get("holding_period"):
        return s["holding_period"]
    label = _holding_label(s)
    if label == "ถือสั้น":
        return "3-10 วันทำการ"
    if label == "ถือยาว":
        return "2-8 สัปดาห์"
    if label == "รอดู":
        return "รอสัญญาณยืนยัน"
    return "หลีกเลี่ยง/ลดสถานะ"


def _market_summary() -> list[str]:
    lines = []
    for payload in _load_market_payloads():
        s = payload.get("summary", {})
        rg = payload.get("regime") or {}
        regime = f" · {rg.get('label')} breadth {rg.get('breadth')}%" if rg else ""
        lines.append(
            f"• <b>{html.escape(payload.get('market_name', '-'))}</b>: "
            f"SB {s.get('strong_buy', 0)} / BUY {s.get('buy', 0)} / "
            f"WATCH {s.get('watch', 0)} / AVOID {s.get('avoid', 0)}{regime}"
        )
    return lines


def _line(s: dict, include_hold: bool = True) -> str:
    cur = s.get("currency", "")
    market = f" [{html.escape(s.get('market', ''))}]" if s.get("market") else ""
    hold = f" · ⏳ {_holding_label(s)} {_holding_period(s)}" if include_hold else ""
    lines = [
        f"• <b>{html.escape(s.get('name', '-'))}</b>{market} "
        f"{s.get('score', 0)}/100 {html.escape(s.get('signal', '-'))}{hold}",
        f"  ราคา {cur}{s.get('price')} ({s.get('change_pct', 0):+.2f}%) · "
        f"เข้า {cur}{s.get('entry')} / SL {cur}{s.get('stop_loss')} / เป้า {cur}{s.get('target1')}",
    ]
    if "risk_reward1" in s or "return_20d" in s:
        lines.append(
            f"  R/R {s.get('risk_reward1', '-')} · Downside {s.get('downside_pct', 0)}% · "
            f"20/60วัน {s.get('return_20d', 0):+.1f}%/{s.get('return_60d', 0):+.1f}%"
        )
    return "\n".join(lines)


def _section(title: str, rows: list[dict], limit: int = 6) -> list[str]:
    lines = [title]
    if not rows:
        lines.append("• ไม่มีรายการ")
        return lines
    lines.extend(_line(s) for s in rows[:limit])
    if len(rows) > limit:
        lines.append(f"• ...อีก {len(rows) - limit} ตัว ดูทั้งหมดบน Dashboard")
    return lines


def _status_lines() -> list[str]:
    status = _load_json("status.json")
    if not status:
        return ["🛎️ <b>สถานะระบบ</b>", "• ยังไม่มี status.json"]
    overall = status.get("overall", {})
    lines = [
        "🛎️ <b>สถานะระบบ</b>",
        f"• ล่าสุด: {html.escape(status.get('generated_at', '-'))}",
        f"• สถานะ: <b>{html.escape(status.get('status', '-'))}</b> · "
        f"ดึงได้ {overall.get('received', 0)}/{overall.get('attempted', 0)} · "
        f"fail {overall.get('fetch_fail_ratio', 0) * 100:.0f}%",
    ]
    for warning in status.get("warnings", [])[:4]:
        lines.append(f"• ⚠️ {html.escape(warning)}")
    return lines


def _performance_lines() -> list[str]:
    perf = _load_json("performance.json")
    if not perf:
        return ["📈 <b>Paper Trading</b>", "• ยังไม่มีข้อมูล performance"]
    s = perf.get("summary", {})
    return [
        "📈 <b>Paper Trading</b>",
        f"• ปิดแล้ว {s.get('closed', 0)} ไม้ · เปิดอยู่ {s.get('open', 0)} ไม้",
        f"• Win rate {s.get('win_rate', 0)}% · เฉลี่ย {s.get('avg_return', 0)}%/ไม้ · สะสม {s.get('total_return', 0)}%",
        f"• ชนเป้า {s.get('by_target', 0)} · Stop {s.get('by_stop', 0)} · ครบเวลา {s.get('by_time', 0)}",
    ]


def _backtest_lines() -> list[str]:
    bt = _load_json("backtest.json")
    if not bt:
        return ["🧪 <b>Backtest</b>", "• ยังไม่มีข้อมูล backtest"]
    o = bt.get("overall", {})
    lines = [
        "🧪 <b>Backtest</b>",
        f"• เทรด {o.get('total_trades', 0)} ครั้ง · ชนะ {o.get('overall_win_rate', 0)}% · เฉลี่ย {o.get('avg_return_per_trade', 0)}%/เทรด",
    ]
    for r in (bt.get("results") or [])[:5]:
        lines.append(
            f"• <b>{html.escape(r.get('name', '-'))}</b>: "
            f"ชนะ {r.get('win_rate', 0)}% · สะสม {r.get('total_return', 0)}% · {r.get('trades', 0)} เทรด"
        )
    return lines


def build_digest(mode: str) -> str:
    now = datetime.now(ICT).strftime("%Y-%m-%d %H:%M")
    rows = _signals()
    buys = sorted([s for s in rows if s.get("signal") in BUY_SIGNALS], key=lambda x: x.get("score", 0), reverse=True)
    shorts = sorted([s for s in buys if _holding_label(s) == "ถือสั้น"], key=lambda x: x.get("score", 0), reverse=True)
    longs = sorted([s for s in buys if _holding_label(s) == "ถือยาว"], key=lambda x: x.get("score", 0), reverse=True)
    movers = sorted(rows, key=lambda x: x.get("change_pct", 0), reverse=True)
    exits = sorted(
        [s for s in rows if s.get("signal") == "AVOID" or "ขาย" in str(s.get("rec_action", ""))],
        key=lambda x: x.get("score", 0),
    )

    titles = {
        "morning": "🌅 <b>สรุปก่อนตลาดเปิด</b>",
        "midday": "☀️ <b>สรุประหว่างวัน</b>",
        "evening": "🌙 <b>สรุปหลังตลาดปิด</b>",
        "weekly": "📆 <b>สรุปประจำสัปดาห์</b>",
        "status": "🛎️ <b>รายงานสถานะระบบ</b>",
        "all": "📊 <b>AI Stock Signal Digest</b>",
    }
    lines = [titles.get(mode, titles["all"]), f"🕐 {now} (เวลาไทย)", ""]

    if mode == "status":
        lines += _status_lines()
    elif mode == "morning":
        lines += _market_summary()
        lines += [""] + _section("🟢 <b>หุ้นเด่นน่าซื้อ</b>", buys, 8)
        lines += [""] + _section("⏳ <b>เหมาะถือยาว</b>", longs, 5)
        lines += [""] + _section("⚡ <b>เหมาะถือสั้น</b>", shorts, 5)
    elif mode == "midday":
        lines += _section("⚡ <b>หุ้นถือสั้น/โมเมนตัมเด่น</b>", shorts, 8)
        lines += [""] + _section("📈 <b>ตัวบวกแรงสุด</b>", movers, 6)
        lines += [""] + _status_lines()
    elif mode == "evening":
        lines += _market_summary()
        lines += [""] + _section("🟢 <b>ควรซื้อ/ติดตามต่อ</b>", buys, 8)
        lines += [""] + _section("🔴 <b>ควรขาย/เลี่ยง</b>", exits, 6)
        lines += [""] + _performance_lines()
    elif mode == "weekly":
        lines += _performance_lines()
        lines += [""] + _backtest_lines()
        lines += [""] + _section("⏳ <b>ถือยาวน่าสนใจ</b>", longs, 8)
        lines += [""] + _section("⚡ <b>ถือสั้นน่าสนใจ</b>", shorts, 8)
    else:
        lines += _market_summary()
        lines += [""] + _section("🟢 <b>หุ้นเด่นน่าซื้อ</b>", buys, 8)
        lines += [""] + _section("⏳ <b>ถือยาว</b>", longs, 6)
        lines += [""] + _section("⚡ <b>ถือสั้น</b>", shorts, 6)
        lines += [""] + _section("🔴 <b>ควรขาย/เลี่ยง</b>", exits, 6)
        lines += [""] + _status_lines()

    lines += [
        "",
        "─────────────",
        "⚠️ <i>ข้อมูลช่วยคัดกรอง ไม่ใช่คำแนะนำการลงทุน และไม่การันตีกำไร</i>",
    ]
    return "\n".join(lines)[:3900]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["morning", "midday", "evening", "weekly", "status", "all"], default="all")
    args = parser.parse_args()
    ok = notifier.send_telegram(build_digest(args.mode))
    if not ok:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
