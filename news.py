"""
news.py — ดึงข่าวล่าสุดต่อหุ้นจาก Google News RSS (ฟรี ไม่ต้องใช้ API key)

ใช้ช่วยดูบริบทว่า "ทำไมราคาขึ้น/ลง" โดยให้ "ข่าวดิบ" ไปอ่านวิเคราะห์เอง
⚠️ ข่าวเป็นบริบทประกอบ ไม่ใช่สาเหตุที่พิสูจน์แล้ว — ข่าวกับราคาอาจไม่เกี่ยวกันก็ได้
⚠️ ความครอบคลุมข่าวหุ้นไทยขึ้นกับ Google News บางตัวอาจไม่มีข่าว

มี cache (state/news_cache.json) อายุ NEWS_TTL_MINUTES เพื่อไม่ยิงถี่เกินไป
"""
from __future__ import annotations

import json
import os
import time
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta
from email.utils import parsedate_to_datetime

import requests

import config

ROOT = os.path.dirname(os.path.abspath(__file__))
CACHE_PATH = os.path.join(ROOT, config.STATE_DIR, "news_cache.json")
ICT = timezone(timedelta(hours=7))

RSS_URL = "https://news.google.com/rss/search?q={q}&hl=th&gl=TH&ceid=TH:th"
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}


def _fmt_date(pubdate: str) -> str:
    try:
        dt = parsedate_to_datetime(pubdate).astimezone(ICT)
        delta = datetime.now(ICT) - dt
        hrs = delta.total_seconds() / 3600
        if hrs < 1:
            return f"{int(delta.total_seconds() / 60)} นาทีที่แล้ว"
        if hrs < 24:
            return f"{int(hrs)} ชม.ที่แล้ว"
        if hrs < 24 * 7:
            return f"{int(hrs / 24)} วันที่แล้ว"
        return dt.strftime("%d/%m/%Y")
    except Exception:
        return ""


def fetch_news(name: str, limit: int | None = None) -> list[dict]:
    """ดึงข่าวสดสำหรับชื่อหุ้นหนึ่งตัว"""
    limit = limit or config.NEWS_MAX_ITEMS
    query = urllib.parse.quote(f"{name} หุ้น")
    try:
        r = requests.get(RSS_URL.format(q=query), headers=HEADERS, timeout=15)
        if r.status_code != 200:
            return []
        root = ET.fromstring(r.content)
        items = []
        for it in root.findall(".//item")[:limit]:
            title = (it.findtext("title") or "").strip()
            link = (it.findtext("link") or "").strip()
            src_el = it.find("source")
            source = (src_el.text if src_el is not None else "") or ""
            # หัวข้อ Google News มักเป็น "หัวข้อ - แหล่งข่าว" ตัดส่วนแหล่งข่าวซ้ำออก
            if source and title.endswith(f" - {source}"):
                title = title[: -(len(source) + 3)]
            items.append({
                "title": title, "link": link, "source": source,
                "published": _fmt_date(it.findtext("pubDate") or ""),
            })
        return items
    except Exception as e:
        print(f"  [news] ดึงข่าว {name} ไม่สำเร็จ: {e}")
        return []


# ── cache ──
def _load_cache() -> dict:
    try:
        with open(CACHE_PATH, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _save_cache(cache: dict) -> None:
    os.makedirs(os.path.dirname(CACHE_PATH), exist_ok=True)
    with open(CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)


def attach_news(signals: list[dict]) -> None:
    """ติดข่าว (จาก cache หรือดึงใหม่) เข้าไปในแต่ละสัญญาณ → s['news']"""
    if not config.NEWS_ENABLED:
        return
    cache = _load_cache()
    now = time.time()
    ttl = config.NEWS_TTL_MINUTES * 60
    fetched = 0
    # เรียงตามคะแนน เพื่อให้หุ้นเด่นได้ข่าวสดก่อนถ้าติด limit
    for s in sorted(signals, key=lambda x: x.get("score", 0), reverse=True):
        tk = s["ticker"]
        entry = cache.get(tk)
        fresh = entry and (now - entry.get("ts", 0) < ttl)
        if fresh:
            s["news"] = entry["items"]
        elif fetched < config.NEWS_FETCH_LIMIT:
            items = fetch_news(s["name"])
            fetched += 1
            if items:
                cache[tk] = {"ts": now, "items": items}
                s["news"] = items
            elif entry:                      # ดึงไม่ได้ ใช้ของเก่า (ดีกว่าว่าง)
                s["news"] = entry["items"]
            else:
                s["news"] = []
            time.sleep(0.15)                 # สุภาพกับเซิร์ฟเวอร์ Google
        else:
            s["news"] = entry["items"] if entry else []
    if fetched:
        _save_cache(cache)
