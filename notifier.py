"""
notifier.py — ส่งข้อความแจ้งเตือนผ่าน Telegram Bot

ต้องตั้งค่า environment variables 2 ตัว:
  TELEGRAM_BOT_TOKEN  — token ของบอท (ได้จาก @BotFather)
  TELEGRAM_CHAT_ID    — chat id ที่จะส่งหา (ได้จาก @userinfobot หรือ getUpdates)

ถ้าไม่ได้ตั้งค่าไว้ ระบบจะข้ามการส่ง (รันต่อได้ปกติ)
"""
from __future__ import annotations

import os
import requests

import config

TELEGRAM_API = "https://api.telegram.org/bot{token}/sendMessage"

REGIME_EMOJI = {"BULL": "🟢", "NEUTRAL": "🟡", "BEAR": "🔴", "UNKNOWN": "⚪"}
CHANGE_EMOJI = {"NEW": "🆕", "UPGRADE": "⬆️", "EXIT": "🚪"}


def _badge(signal: str) -> str:
    return {
        "STRONG BUY": "🟢🟢",
        "BUY": "🟢",
        "WATCH": "🟡",
        "AVOID": "🔴",
    }.get(signal, "⚪")


def build_message(signals: list[dict], generated_at: str, min_score: int) -> str:
    picks = [s for s in signals if s["score"] >= min_score]
    lines = [
        "📊 <b>AI Stock Signal — SET</b>",
        f"🕐 {generated_at}",
        "",
    ]

    if not picks:
        lines.append("วันนี้ <b>ยังไม่มีหุ้น</b> ที่ผ่านเกณฑ์น่าซื้อ")
        lines.append("ตลาดอาจอยู่ในภาวะไม่ชัดเจน — การ \"ไม่ทำอะไร\" ก็เป็นกลยุทธ์")
    else:
        lines.append(f"พบ <b>{len(picks)}</b> ตัวที่เข้าเงื่อนไขน่าสนใจ:")
        lines.append("")
        for s in picks:
            lines.append(
                f"{_badge(s['signal'])} <b>{s['name']}</b> "
                f"({s['signal']} · คะแนน {s['score']}/100)"
            )
            lines.append(
                f"   ราคา {s['price']} ({s['change_pct']:+.2f}%) · "
                f"RSI {s['rsi']}"
            )
            lines.append(
                f"   เข้า ~{s['entry']} | ตัดขาดทุน {s['stop_loss']} | "
                f"เป้า {s['target1']} / {s['target2']}"
            )
            if s.get("reasons"):
                lines.append(f"   💡 {s['reasons'][0]}")
            lines.append("")

    lines.append("─────────────")
    lines.append(
        "⚠️ <i>เป็นการคัดกรองด้วยอินดิเคเตอร์ทางเทคนิคเท่านั้น "
        "ไม่ใช่คำแนะนำการลงทุน และไม่การันตีกำไร โปรดตัดสินใจด้วยตนเอง</i>"
    )
    return "\n".join(lines)


def build_change_message(changes: list[dict], regime: dict | None, generated_at: str,
                         min_score: int, fail_ratio: float = 0.0,
                         perf: dict | None = None) -> str:
    """ข้อความแจ้งเตือนแบบ 'เฉพาะที่เปลี่ยน' + ภาวะตลาด + ผลจริง + heartbeat"""
    lines = ["📊 <b>AI Stock Signal — SET</b>", f"🕐 {generated_at}"]
    if regime:
        lines.append(
            f"{REGIME_EMOJI.get(regime['regime'], '⚪')} ภาวะตลาด: "
            f"<b>{regime['label']}</b> (breadth {regime['breadth']}%)"
        )
    lines.append("")

    buys = [c for c in changes
            if c.get("change") in ("NEW", "UPGRADE") and c.get("score", 0) >= min_score]
    exits = [c for c in changes if c.get("change") == "EXIT"]

    if not buys and not exits:
        lines.append("วันนี้ <b>ไม่มีสัญญาณใหม่</b>ที่ผ่านเกณฑ์ — ถือเงินสด/รอจังหวะก็เป็นกลยุทธ์")
        lines.append("")

    if buys:
        lines.append(f"🟢 <b>ควรพิจารณาซื้อ ({len(buys)})</b>")
        for c in buys:
            emo = CHANGE_EMOJI.get(c["change"], "•")
            lines.append(f"{emo} <b>{c['name']}</b> · {c['signal']} · คะแนน {c['score']}/100")
            lines.append(f"   เข้า ~{c['price']} | ตัดขาดทุน {c['stop_loss']} | เป้า {c['target1']}")
            if c.get("pos_shares"):
                lines.append(f"   💼 ขนาดไม้แนะนำ ~{c['pos_shares']:,} หุ้น (~{c['pos_value']:,.0f}฿)")
        lines.append("")

    if exits:
        lines.append(f"🚪 <b>หลุดสัญญาณ — พิจารณาขาย/ออก ({len(exits)})</b>")
        for c in exits:
            lines.append(f"   {c['name']} (เดิม {c.get('prev_signal', '-')})")
        lines.append("")

    if perf and perf.get("summary", {}).get("closed", 0) > 0:
        s = perf["summary"]
        lines.append(
            f"📈 ผลจริงสะสม: ปิดแล้ว {s['closed']} ไม้ · ชนะ {s['win_rate']}% · "
            f"เฉลี่ย {s['avg_return']}%/ไม้ (เปิดอยู่ {s['open']})"
        )

    if fail_ratio > 0.0001:
        lines.append(f"⚠️ ดึงข้อมูลล้มเหลว ~{fail_ratio * 100:.0f}% ของลิสต์ — ตรวจสอบแหล่งข้อมูล")

    if config.SEND_HEARTBEAT:
        lines.append("✅ ระบบทำงานปกติ")

    lines.append("─────────────")
    lines.append("⚠️ <i>คัดกรองด้วยอินดิเคเตอร์ทางเทคนิคเท่านั้น ไม่ใช่คำแนะนำการลงทุน "
                 "และไม่การันตีกำไร โปรดตัดสินใจด้วยตนเอง</i>")
    return "\n".join(lines)


def send_failure(error_text: str) -> bool:
    """แจ้งเตือนเมื่อระบบมีปัญหา (heartbeat ฝั่งล้มเหลว)"""
    msg = ("🛑 <b>AI Stock Signal — ระบบมีปัญหา</b>\n\n"
           f"<code>{str(error_text)[:500]}</code>\n\n"
           "โปรดตรวจสอบ log ใน GitHub Actions")
    return send_telegram(msg)


def send_telegram(message: str) -> bool:
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    chat_id = os.environ.get("TELEGRAM_CHAT_ID", "").strip()
    if not token or not chat_id:
        print("  [info] ไม่พบ TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID — ข้ามการส่ง Telegram")
        return False

    try:
        resp = requests.post(
            TELEGRAM_API.format(token=token),
            json={
                "chat_id": chat_id,
                "text": message,
                "parse_mode": "HTML",
                "disable_web_page_preview": True,
            },
            timeout=20,
        )
        if resp.status_code == 200 and resp.json().get("ok"):
            print("  [ok] ส่งแจ้งเตือน Telegram สำเร็จ")
            return True
        print(f"  [error] Telegram ตอบกลับผิดพลาด: {resp.status_code} {resp.text[:200]}")
        return False
    except Exception as e:
        print(f"  [error] ส่ง Telegram ไม่สำเร็จ: {e}")
        return False
