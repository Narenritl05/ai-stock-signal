"""
self_heal.py — ตรวจและซ่อม output ของระบบอัตโนมัติ

ใช้ใน GitHub Actions ทุก 30 นาที:
  1. เรียก watchdog.check_status() เพื่อตรวจว่า dashboard data ยังปกติไหม
  2. ถ้าปกติ จบโดยไม่ทำอะไร
  3. ถ้าผิดปกติ รัน pipeline ใหม่เพื่อสร้าง JSON/state/status ใหม่
  4. ตรวจซ้ำ ถ้าหายแล้วให้ workflow commit ผลลัพธ์
  5. ถ้ายังผิดปกติ ส่ง Telegram และ fail workflow เพื่อให้เห็นใน Actions
"""
from __future__ import annotations

import time
import os
from datetime import datetime, timezone

import requests

import config
import notifier
import run
import watchdog


def _dedupe(items: list[str]) -> list[str]:
    return list(dict.fromkeys(items))


def _format_problem_list(title: str, problems: list[str]) -> str:
    lines = [title]
    lines += [f"• {p}" for p in _dedupe(problems)]
    return "\n".join(lines)


def _parse_github_time(value: str) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _current_status_time() -> datetime | None:
    status = watchdog._load_json(watchdog.STATUS_PATH)
    if not status:
        return None
    ts = watchdog._parse_iso(status.get("generated_at_iso", ""))
    if ts and ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return ts.astimezone(timezone.utc) if ts else None


def _github_workflow_problems() -> list[str]:
    """Detect a failed analyze workflow that happened after the latest healthy status."""
    token = os.environ.get("GITHUB_TOKEN", "").strip()
    repo = os.environ.get("GITHUB_REPOSITORY", "").strip()
    branch = os.environ.get("GITHUB_REF_NAME", "").strip()
    if not token or not repo:
        return []

    url = f"https://api.github.com/repos/{repo}/actions/workflows/analyze.yml/runs"
    params = {"per_page": 1}
    if branch:
        params["branch"] = branch
    try:
        resp = requests.get(
            url,
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
            params=params,
            timeout=20,
        )
        resp.raise_for_status()
        runs = resp.json().get("workflow_runs") or []
    except Exception as e:
        return [f"ตรวจสถานะ GitHub Actions ไม่สำเร็จ: {type(e).__name__}: {e}"]

    if not runs:
        return []
    latest = runs[0]
    conclusion = latest.get("conclusion")
    if conclusion not in {"failure", "timed_out", "cancelled", "startup_failure"}:
        return []

    failed_at = _parse_github_time(latest.get("updated_at", ""))
    status_at = _current_status_time()
    if failed_at and status_at and failed_at <= status_at:
        return []

    run_url = latest.get("html_url", "")
    return [f"GitHub Actions analyze.yml ล่าสุดล้มเหลว ({conclusion}) {run_url}".strip()]


def _notify_repaired(before: list[str], attempt: int) -> None:
    msg = [
        "🛠️ <b>AI Stock Signal — Self-heal สำเร็จ</b>",
        "",
        f"ซ่อมสำเร็จหลังลองรัน pipeline ครั้งที่ {attempt}",
        "",
        _format_problem_list("ปัญหาที่พบก่อนซ่อม:", before),
    ]
    notifier.send_telegram("\n".join(msg))


def _notify_failed(before: list[str], after: list[str]) -> None:
    msg = [
        "🛑 <b>AI Stock Signal — Self-heal ไม่สำเร็จ</b>",
        "",
        _format_problem_list("ปัญหาก่อนซ่อม:", before),
        "",
        _format_problem_list("ปัญหาหลังซ่อม:", after),
        "",
        "โปรดตรวจสอบ GitHub Actions log และแหล่งข้อมูลราคา",
    ]
    notifier.send_telegram("\n".join(msg))


def main() -> None:
    before = watchdog.check_status()
    before.extend(_github_workflow_problems())
    if not before:
        print("Self-heal check OK: no repair needed.")
        return

    print("Self-heal detected problems:")
    for p in _dedupe(before):
        print(f"  - {p}")

    after = before
    for attempt in range(1, config.SELF_HEAL_MAX_ATTEMPTS + 1):
        if attempt > 1:
            print(f"Waiting {config.SELF_HEAL_RETRY_SECONDS}s before retry...")
            time.sleep(config.SELF_HEAL_RETRY_SECONDS)

        print(f"Repair attempt {attempt}/{config.SELF_HEAL_MAX_ATTEMPTS}: running analysis pipeline...")
        try:
            run.run_pipeline(notify_no_changes=False)
        except Exception as e:
            after = [f"pipeline error: {type(e).__name__}: {e}"]
            print(after[0])
            continue

        after = watchdog.check_status()
        if not after:
            print("Self-heal repaired the system.")
            _notify_repaired(before, attempt)
            return

        print("Repair attempt did not pass validation:")
        for p in _dedupe(after):
            print(f"  - {p}")

    _notify_failed(before, after)
    raise SystemExit(1)


if __name__ == "__main__":
    main()
