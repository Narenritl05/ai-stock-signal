"""
telegram_bot.py — ตอบคำถามหุ้นรายตัวใน Telegram

วิธีใช้:
  1. ตั้งค่า Telegram ใน env หรือ telegram.txt เหมือนระบบแจ้งเตือนปกติ
  2. รัน `python telegram_bot.py` แล้วเปิดทิ้งไว้
  3. ส่งข้อความหา bot เช่น `AOT`, `NVDA`, `/stock PTT`
"""
from __future__ import annotations

import html
import json
import os
import re
import time
from datetime import datetime

import requests

import config
import market
import news
import notifier
import run
from analyzer import analyze_one

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(ROOT, "docs", "data")
BOT_API = "https://api.telegram.org/bot{token}/{method}"


def _norm(text: str) -> str:
    return re.sub(r"[^A-Z0-9.]", "", text.upper())


def _display_ticker(ticker: str) -> str:
    return ticker[:-3] if ticker.endswith(".BK") else ticker


def _load_payloads() -> list[dict]:
    payloads = []
    for m in config.MARKETS.values():
        path = os.path.join(DATA_DIR, m["file"])
        try:
            with open(path, encoding="utf-8") as f:
                payloads.append(json.load(f))
        except (FileNotFoundError, json.JSONDecodeError):
            continue
    return payloads


def _find_in_payloads(query: str) -> tuple[dict | None, dict | None]:
    q = _norm(query)
    if not q:
        return None, None
    for payload in _load_payloads():
        for s in payload.get("signals", []):
            ticker = _norm(s.get("ticker", ""))
            short = _norm(_display_ticker(s.get("ticker", "")))
            name = _norm(s.get("name", ""))
            if q in (ticker, short, name) or (len(q) >= 2 and q in name):
                return s, payload
    return None, None


def _find_in_config(query: str) -> tuple[str, str, dict] | None:
    q = _norm(query)
    for m in config.MARKETS.values():
        for ticker, name in m["watchlist"].items():
            ticker_norm = _norm(ticker)
            short = _norm(_display_ticker(ticker))
            name_norm = _norm(name)
            if q in (ticker_norm, short, name_norm) or (len(q) >= 2 and q in name_norm):
                return ticker, name, m
    return None


def _compact_text(text: str) -> str:
    return re.sub(r"\s+", "", str(text or "").casefold())


def _match_rank(query: str, ticker: str, name: str) -> int | None:
    code_q = _norm(query)
    text_q = _compact_text(query)
    if not code_q and not text_q:
        return None

    short = _display_ticker(ticker)
    code_fields = [_norm(ticker), _norm(short), _norm(name)]
    text_fields = [_compact_text(ticker), _compact_text(short), _compact_text(name)]

    if code_q and code_q in code_fields[:2]:
        return 0
    if text_q and text_q in text_fields[:2]:
        return 0
    if code_q and any(f.startswith(code_q) for f in code_fields[:2]):
        return 1
    if text_q and any(f.startswith(text_q) for f in text_fields[:2]):
        return 1
    if code_q and code_q in code_fields[2]:
        return 2
    if text_q and len(text_q) >= 2 and text_q in text_fields[2]:
        return 2
    if code_q and len(code_q) >= 2 and any(code_q in f for f in code_fields[:2]):
        return 3
    if text_q and len(text_q) >= 2 and any(text_q in f for f in text_fields[:2]):
        return 3
    return None


def _search_stocks(query: str, limit: int = 15) -> list[dict]:
    results: list[dict] = []
    seen: set[str] = set()

    for payload in _load_payloads():
        for s in payload.get("signals", []):
            ticker = str(s.get("ticker", ""))
            rank = _match_rank(query, ticker, str(s.get("name", "")))
            if rank is None:
                continue
            seen.add(ticker)
            results.append({
                "rank": rank,
                "ticker": ticker,
                "name": s.get("name", ticker),
                "market": s.get("market") or payload.get("market_name") or "",
                "currency": s.get("currency") or payload.get("currency") or "",
                "price": s.get("price"),
                "change_pct": s.get("change_pct"),
                "signal": s.get("signal"),
                "score": s.get("score"),
                "source": "cached",
            })

    for m in config.MARKETS.values():
        for ticker, name in m["watchlist"].items():
            if ticker in seen:
                continue
            rank = _match_rank(query, ticker, name)
            if rank is None:
                continue
            results.append({
                "rank": rank + 4,
                "ticker": ticker,
                "name": name,
                "market": m.get("short", ""),
                "currency": m.get("currency", ""),
                "source": "watchlist",
            })

    results.sort(key=lambda x: (x["rank"], _display_ticker(x["ticker"]), str(x["name"])))
    return results[:limit]


def _search_message(query: str) -> str:
    q = query.strip()
    if not q:
        return "พิมพ์คำค้นต่อท้ายด้วยครับ เช่น <code>/search PTT</code> หรือ <code>ค้นหา NVDA</code>"

    matches = _search_stocks(q)
    if not matches:
        return (
            f"ไม่พบหุ้นที่ตรงกับ <b>{html.escape(q)}</b> ใน watchlist ครับ\n\n"
            "ลองค้นด้วย ticker เช่น <code>PTT</code>, <code>AOT</code>, <code>NVDA</code>"
        )

    lines = [
        f"🔎 ผลการค้นหา: <b>{html.escape(q)}</b>",
        f"พบ {len(matches)} รายการแรกจาก watchlist/ข้อมูลล่าสุด",
        "",
    ]
    for item in matches:
        ticker = _display_ticker(item["ticker"])
        market_label = f" · {item['market']}" if item.get("market") else ""
        if item.get("source") == "cached":
            cur = item.get("currency") or ""
            price = item.get("price")
            change = item.get("change_pct")
            signal = item.get("signal") or "-"
            score = item.get("score")
            price_text = f" · {cur}{price}" if price is not None else ""
            change_text = f" ({change:+.2f}%)" if isinstance(change, (int, float)) else ""
            score_text = f" · {score}/100" if score is not None else ""
            detail = f"{price_text}{change_text} · {signal}{score_text}"
        else:
            detail = " · ยังไม่มีข้อมูลล่าสุด กด /stock เพื่อวิเคราะห์สด"
        lines.append(
            f"• <b>{html.escape(ticker)}</b>{market_label} — {html.escape(str(item['name']))}{detail}\n"
            f"  ดูเต็ม: <code>/stock {html.escape(ticker)}</code>"
        )

    lines += [
        "",
        "หมายเหตุ: ใช้ข้อมูลฟรีจาก watchlist และไฟล์ dashboard เท่านั้น ไม่มีค่าใช้จ่ายเพิ่ม",
    ]
    return "\n".join(lines)[:3900]


def _fresh_signal(query: str) -> tuple[dict | None, dict | None]:
    found = _find_in_config(query)
    if not found:
        return None, None
    ticker, name, m = found
    sig = analyze_one(ticker, name)
    if not sig:
        return None, None
    sig["market"] = m["short"]
    sig["market_tag"] = m["tag"]
    sig["currency"] = m["currency"]
    if sig["signal"] in ("BUY", "STRONG BUY"):
        ps = market.position_size(sig["entry"], sig["stop_loss"])
        sig["pos_shares"] = ps["shares"]
        sig["pos_value"] = ps["value"]
    payload = {
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M") + " (สดจากคำถาม)",
        "market_name": m["name"],
        "currency": m["currency"],
        "regime": None,
    }
    return sig, payload


def _stock_message(query: str) -> str:
    sig, payload = _find_in_payloads(query)
    source = "ข้อมูลล่าสุดจาก Dashboard"
    if not sig:
        sig, payload = _fresh_signal(query)
        source = "วิเคราะห์สดรายตัว"
    if not sig:
        return (
            "ไม่พบหุ้นนี้ใน watchlist ครับ\n\n"
            "ลองพิมพ์ ticker เช่น <code>AOT</code>, <code>PTT</code>, <code>NVDA</code> "
            "หรือใช้คำสั่ง <code>/stock AOT</code>"
        )

    cur = sig.get("currency") or (payload or {}).get("currency") or ""
    tag = f" [{html.escape(sig.get('market', ''))}]" if sig.get("market") else ""
    rec = sig.get("rec_action") or "ถือ/รอ"
    tone = sig.get("rec_text") or rec
    updated = (payload or {}).get("generated_at", "-")
    lines = [
        f"📌 <b>{html.escape(sig['name'])}</b>{tag}",
        f"🕐 {html.escape(updated)} · {source}",
        "",
        f"👉 สถานะ: <b>{html.escape(rec)}</b> ({html.escape(sig['signal'])} · {sig['score']}/100)",
        f"💬 {html.escape(tone)}",
        f"⏳ กรอบการถือ: <b>{html.escape(sig.get('holding_label', '-'))}</b> · {html.escape(sig.get('holding_period', '-'))}",
        f"   {html.escape(sig.get('holding_text', ''))}",
        f"ราคา: <b>{cur}{sig['price']}</b> ({sig['change_pct']:+.2f}%)",
        f"เข้า ~{cur}{sig['entry']} | ตัดขาดทุน {cur}{sig['stop_loss']} | เป้า {cur}{sig['target1']} / {cur}{sig['target2']}",
        f"RSI {sig['rsi']} · MACD hist {sig['macd_hist']} · Trend {html.escape(sig['trend'])} · Volume {sig['volume_ratio']}x",
    ]
    if "open" in sig:
        lines.append(
            f"O/H/L {cur}{sig.get('open')}/{cur}{sig.get('day_high')}/{cur}{sig.get('day_low')} · "
            f"ปิดก่อน {cur}{sig.get('prev_close')}"
        )
    if "risk_reward1" in sig:
        lines.append(
            f"Risk/Reward {sig.get('risk_reward1', '-')}/{sig.get('risk_reward2', '-')} · "
            f"Downside {sig.get('downside_pct', 0)}% · ATR {sig.get('atr_pct', 0)}%"
        )
    if "return_20d" in sig:
        lines.append(
            f"20/60 วัน {sig.get('return_20d', 0):+.2f}% / {sig.get('return_60d', 0):+.2f}% · "
            f"จาก High120 {sig.get('from_high_120d_pct', 0):+.2f}%"
        )
    if "volume" in sig:
        lines.append(
            f"Volume {sig.get('volume', 0):,} · Avg {sig.get('avg_volume', 0):,} · "
            f"Turnover ~{cur}{sig.get('turnover', 0):,.0f}"
        )
    if sig.get("holding_reason"):
        lines.append(f"เหตุผลกรอบถือ: {html.escape(sig['holding_reason'])}")
    if sig.get("pos_shares"):
        lines.append(f"ขนาดไม้แนะนำ ~{sig['pos_shares']:,} หุ้น · มูลค่า ~{cur}{sig.get('pos_value', 0):,.2f}")

    reasons = sig.get("reasons") or []
    warnings = sig.get("warnings") or []
    if reasons:
        lines += ["", "✅ เหตุผลเด่น:"] + [f"• {html.escape(r)}" for r in reasons[:3]]
    if warnings:
        lines += ["", "⚠️ จุดที่ต้องระวัง:"] + [f"• {html.escape(w)}" for w in warnings[:3]]

    items = news.fetch_news(sig["name"], limit=3)
    if items:
        lines += ["", "📰 ข่าวล่าสุด:"]
        for item in items:
            title = html.escape(item.get("title") or "-")
            link = html.escape(item.get("link") or "")
            source_name = html.escape(item.get("source") or "")
            published = html.escape(item.get("published") or "")
            meta = " · ".join(x for x in (source_name, published) if x)
            lines.append(f"• <a href=\"{link}\">{title}</a>{' — ' + meta if meta else ''}")
    else:
        lines += ["", "📰 ยังไม่พบข่าวล่าสุดจาก Google News สำหรับตัวนี้"]

    lines += [
        "",
        "⚠️ <i>เป็นข้อมูลช่วยคัดกรอง ไม่ใช่คำแนะนำการลงทุนหรือการันตีกำไร</i>",
    ]
    return "\n".join(lines)[:3900]


def _latest_summary_message(source: str = "ข้อมูลล่าสุด") -> str:
    payloads = _load_payloads()
    status = {}
    try:
        with open(os.path.join(DATA_DIR, "status.json"), encoding="utf-8") as f:
            status = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        status = {}

    generated = status.get("generated_at") or next((p.get("generated_at") for p in payloads if p.get("generated_at")), "-")
    lines = [
        "🔄 <b>AI Stock Signal — Update</b>",
        f"🕐 {html.escape(str(generated))}",
        f"📌 {html.escape(source)}",
        "",
    ]

    total = 0
    for payload in payloads:
        summary = payload.get("summary") or {}
        total += payload.get("count") or len(payload.get("signals", []))
        name = payload.get("market_name") or payload.get("market_key") or "ตลาด"
        lines.append(
            f"• <b>{html.escape(str(name))}</b>: "
            f"Strong {summary.get('strong_buy', 0)} · Buy {summary.get('buy', 0)} · "
            f"Watch {summary.get('watch', 0)} · Avoid {summary.get('avoid', 0)}"
        )

    picks = []
    for payload in payloads:
        picks.extend([
            {**s, "_market_name": payload.get("market_name", ""), "_currency": s.get("currency") or payload.get("currency") or ""}
            for s in payload.get("signals", [])
            if s.get("signal") in ("STRONG BUY", "BUY")
        ])
    picks.sort(key=lambda x: x.get("score", 0), reverse=True)

    lines += ["", f"รวมข้อมูลล่าสุด {total} ตัว"]
    if picks:
        lines += ["", "🟢 ตัวเด่นล่าสุด:"]
        for s in picks[:8]:
            cur = s.get("_currency", "")
            market_label = f" · {s.get('market') or s.get('_market_name')}" if (s.get("market") or s.get("_market_name")) else ""
            lines.append(
                f"• <b>{html.escape(_display_ticker(s.get('ticker', '')))}</b>{market_label} — "
                f"{html.escape(str(s.get('signal', '-')))} {s.get('score', '-')}/100 · "
                f"{cur}{s.get('price', '-')}"
            )
    else:
        lines += ["", "ยังไม่มี BUY/STRONG BUY ในข้อมูลล่าสุด"]

    warnings = status.get("warnings") or []
    if warnings:
        lines += ["", "⚠️ คำเตือนระบบ:"]
        lines += [f"• {html.escape(str(w))}" for w in warnings[:4]]

    lines += ["", "ดูหุ้นรายตัว: <code>/stock AOT</code> หรือพิมพ์ ticker ได้เลย"]
    return "\n".join(lines)[:3900]


def _update_message() -> str:
    try:
        run.run_pipeline(notify_no_changes=False, send_notification=False)
        return _latest_summary_message("อัปเดตสดจากคำสั่ง Telegram")
    except Exception as e:
        return (
            "🛑 <b>อัปเดตไม่สำเร็จ</b>\n"
            f"<code>{html.escape(type(e).__name__)}: {html.escape(str(e)[:500])}</code>\n\n"
            "ลองดู log บนเครื่องที่เปิด Telegram bot หรือใช้ GitHub Actions Run workflow"
        )


def _is_update_command(text: str) -> bool:
    return text.strip().casefold() in ("update", "/update", "อัปเดต", "อัพเดต")


def _send(token: str, chat_id: int | str, text: str) -> None:
    requests.post(
        BOT_API.format(token=token, method="sendMessage"),
        json={
            "chat_id": chat_id,
            "text": text,
            "parse_mode": "HTML",
            "disable_web_page_preview": False,
        },
        timeout=20,
    ).raise_for_status()


def _bot_name(token: str) -> str:
    try:
        resp = requests.get(BOT_API.format(token=token, method="getMe"), timeout=15)
        data = resp.json()
        if data.get("ok"):
            username = data.get("result", {}).get("username")
            return f"@{username}" if username else "Telegram bot"
    except Exception:
        pass
    return "Telegram bot"


def _updates(token: str, offset: int | None) -> list[dict]:
    params = {"timeout": 25}
    if offset is not None:
        params["offset"] = offset
    resp = requests.get(BOT_API.format(token=token, method="getUpdates"), params=params, timeout=35)
    resp.raise_for_status()
    return resp.json().get("result", [])


def _handle_text(text: str) -> str:
    text = text.strip()
    if text in ("/start", "/help"):
        return (
            "ส่งชื่อหุ้นหรือ ticker มาได้เลยครับ เช่น <code>AOT</code>, <code>PTT</code>, <code>NVDA</code>\n"
            "หรือใช้ <code>/stock AOT</code> เพื่อดูวิเคราะห์เต็ม\n"
            "ค้นหาหุ้นได้ด้วย <code>/search PTT</code> หรือ <code>ค้นหา NVDA</code>\n\n"
            "สั่งอัปเดตข้อมูลล่าสุดด้วย <code>update</code> หรือ <code>/update</code>\n\n"
            "ระบบจะตอบสถานะซื้อ/ขาย จุดเข้า จุดตัดขาดทุน เป้า อินดิเคเตอร์สำคัญ และข่าวล่าสุด"
        )
    if _is_update_command(text):
        return _update_message()
    search_prefixes = ("/search", "/find", "/check", "/shech", "search ", "find ", "check ", "shech ", "ค้นหา ", "หา ")
    for prefix in search_prefixes:
        if text.casefold().startswith(prefix.casefold()):
            return _search_message(text[len(prefix):].strip())
    if text.startswith("/stock") or text.startswith("/หุ้น"):
        parts = text.split(maxsplit=1)
        if len(parts) == 1:
            return "พิมพ์ชื่อหุ้นต่อท้ายด้วยครับ เช่น <code>/stock AOT</code>"
        text = parts[1]
    elif text.startswith("/"):
        return "คำสั่งที่ใช้ได้: <code>/stock AOT</code>, <code>/search PTT</code> หรือส่ง ticker มาเลย เช่น <code>NVDA</code>"
    return _stock_message(text)


def main() -> None:
    token, allowed_chat_id = notifier._load_credentials()
    if not token:
        raise SystemExit("ยังไม่ได้ตั้งค่า TELEGRAM_BOT_TOKEN หรือ BOT_TOKEN ใน telegram.txt")

    name = _bot_name(token)
    print(f"{name} is running. Press Ctrl+C to stop.")
    print("ส่งข้อความใน Telegram เช่น AOT, PTT, NVDA หรือ /stock AOT")
    if allowed_chat_id:
        try:
            _send(
                token,
                allowed_chat_id,
                "✅ <b>AI Stock Signal Bot พร้อมรับคำถามแล้ว</b>\n\n"
                "พิมพ์ชื่อหุ้นหรือ ticker เช่น <code>AOT</code>, <code>PTT</code>, "
                "<code>NVDA</code> หรือ <code>/stock AOT</code>",
            )
        except Exception as e:
            print(f"[bot] ส่งข้อความเริ่มต้นไม่สำเร็จ: {type(e).__name__}: {e}")
    offset = None
    while True:
        try:
            for upd in _updates(token, offset):
                offset = upd["update_id"] + 1
                msg = upd.get("message") or {}
                chat = msg.get("chat") or {}
                chat_id = str(chat.get("id", ""))
                text = msg.get("text") or ""
                if not chat_id or not text:
                    continue
                if allowed_chat_id and chat_id != str(allowed_chat_id):
                    print(f"Ignore unauthorized chat: {chat_id}")
                    continue
                if _is_update_command(text):
                    _send(token, chat_id, "⏳ กำลังอัปเดตข้อมูลล่าสุด อาจใช้เวลาสักครู่...")
                _send(token, chat_id, _handle_text(text))
        except KeyboardInterrupt:
            raise
        except Exception as e:
            print(f"[bot] {type(e).__name__}: {e}")
            time.sleep(5)


if __name__ == "__main__":
    main()
