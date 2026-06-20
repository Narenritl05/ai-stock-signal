"""
watchdog.py — ตรวจว่า output ล่าสุดของ GitHub Actions ยังสดและสมบูรณ์

รันบน GitHub Actions เป็นตัวเฝ้าระวังแยกจาก pipeline หลัก:
  - status.json ต้องมีและไม่เก่ากว่า WATCHDOG_MAX_AGE_HOURS
  - fail ratio ของรอบล่าสุดต้องไม่เกิน FETCH_FAIL_WARN_RATIO
  - ทุกตลาดใน config.MARKETS ต้องมีไฟล์ output
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone

import config
import notifier

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(ROOT, "docs", "data")
STATUS_PATH = os.path.join(DATA_DIR, "status.json")


def _load_json(path: str) -> dict | None:
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def _parse_iso(value: str) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def check_status() -> list[str]:
    problems: list[str] = []
    status = _load_json(STATUS_PATH)
    if not status:
        return [f"ไม่พบหรืออ่าน {os.path.relpath(STATUS_PATH, ROOT)} ไม่ได้"]

    ts = _parse_iso(status.get("generated_at_iso", ""))
    if not ts:
        problems.append("status.json ไม่มี generated_at_iso ที่อ่านได้")
    else:
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        age_hours = (datetime.now(timezone.utc) - ts.astimezone(timezone.utc)).total_seconds() / 3600
        if age_hours > config.WATCHDOG_MAX_AGE_HOURS:
            problems.append(
                f"ข้อมูลล่าสุดเก่า {age_hours:.1f} ชั่วโมง "
                f"(เกณฑ์ {config.WATCHDOG_MAX_AGE_HOURS} ชั่วโมง)"
            )

    overall = status.get("overall", {})
    fail_ratio = float(overall.get("fetch_fail_ratio") or 0)
    if fail_ratio >= config.FETCH_FAIL_WARN_RATIO:
        problems.append(
            f"ดึงข้อมูลล้มเหลว {fail_ratio * 100:.0f}% "
            f"(เกณฑ์ {config.FETCH_FAIL_WARN_RATIO * 100:.0f}%)"
        )

    if status.get("status") == "warning":
        problems.extend(status.get("warnings") or [])

    for key, market in config.MARKETS.items():
        output = os.path.join(DATA_DIR, market["file"])
        data = _load_json(output)
        if not data:
            problems.append(f"{key}: ไม่พบหรืออ่าน docs/data/{market['file']} ไม่ได้")
        elif not data.get("signals"):
            problems.append(f"{key}: docs/data/{market['file']} ไม่มีรายการ signals")

    return problems


def main() -> None:
    problems = check_status()
    if not problems:
        print("Watchdog OK: dashboard data is fresh.")
        return

    msg = ["🛎️ <b>AI Stock Signal — Watchdog Alert</b>", ""]
    msg += [f"• {p}" for p in dict.fromkeys(problems)]
    msg += ["", "โปรดตรวจสอบ GitHub Actions และแหล่งข้อมูลราคา"]
    sent = notifier.send_telegram("\n".join(msg))
    if not sent:
        print("Watchdog found problems, but Telegram is not configured or failed.")
    for p in problems:
        print(f"[watchdog] {p}")
    raise SystemExit(1)


if __name__ == "__main__":
    main()
