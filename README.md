# 📈 AI Stock Signal — ระบบคัดกรองหุ้น SET อัตโนมัติ

ระบบวิเคราะห์หุ้นไทย (SET) ด้วย Technical Analysis ให้คะแนนสัญญาณ **STRONG BUY / BUY / WATCH / AVOID**
ส่งแจ้งเตือนผ่าน **Telegram** ว่าควรซื้อตัวไหน ตอนไหน พร้อมเว็บ **Dashboard** (ธีมดำ-เขียว)
รันอัตโนมัติทุกวันทำการ — **ฟรี 100% ไม่มีค่า server** (ใช้ GitHub Actions + GitHub Pages)

---

## ⚠️ อ่านก่อนใช้ — สำคัญมาก

> **ไม่มีระบบใดการันตีกำไร 100% ได้** ตลาดหุ้นมีความไม่แน่นอนเสมอ
> เครื่องมือนี้เป็น **"ตัวช่วยคัดกรอง"** ด้วยอินดิเคเตอร์ทางเทคนิค เพื่อ **ประหยัดเวลาในการสแกนหุ้น**
> ไม่ใช่คำแนะนำการลงทุน และ **ไม่สั่งซื้อ-ขายแทนคุณ** — การตัดสินใจสุดท้ายเป็นของคุณเสมอ
> โปรดบริหารความเสี่ยง ลงทุนเท่าที่รับความเสียหายได้

---

## 🧩 ระบบทำงานยังไง

```
GitHub Actions (ตั้งเวลา)  ──►  run.py
                                  │
                 ┌────────────────┼─────────────────┐
                 ▼                ▼                  ▼
          ดึงราคา (yfinance)   วิเคราะห์         signals.json
          หุ้น SET ทั้งหมด    (RSI/MACD/EMA)    (อัปเดต dashboard)
                                  │
                                  ▼
                          ส่งแจ้งเตือน Telegram
                          "ควรซื้ออะไร ตอนไหน"
```

- **ตัววิเคราะห์ ("AI"):** รวมสัญญาณหลายอินดิเคเตอร์ — เทรนด์ (EMA20/50), RSI, MACD,
  วอลุ่ม, โมเมนตัม — แล้วให้คะแนน 0–100 ([`analyzer.py`](analyzer.py))
- **แจ้งเตือน:** Telegram bot ([`notifier.py`](notifier.py))
- **เว็บฟรี:** GitHub Pages เสิร์ฟโฟลเดอร์ [`docs/`](docs/)
- **อัตโนมัติ:** GitHub Actions cron ([`.github/workflows/analyze.yml`](.github/workflows/analyze.yml))

---

## 🚀 วิธีติดตั้ง (ทำครั้งเดียว ~15 นาที)

### ขั้นที่ 1 — สร้าง Telegram Bot (รับการแจ้งเตือน)

1. เปิด Telegram แชทหา **@BotFather** → พิมพ์ `/newbot` → ตั้งชื่อบอท
2. จะได้ **Bot Token** หน้าตาแบบ `123456789:ABCd...` → เก็บไว้
3. แชทหา **@userinfobot** → กด Start → จะได้ **Chat ID** (ตัวเลข เช่น `987654321`)
4. **สำคัญ:** เปิดแชทกับบอทที่เพิ่งสร้าง แล้วพิมพ์ `/start` 1 ครั้ง (ไม่งั้นบอทส่งหาคุณไม่ได้)

### ขั้นที่ 2 — อัปโหลดโค้ดขึ้น GitHub

1. สมัคร/ล็อกอิน [github.com](https://github.com) (ฟรี)
2. สร้าง repository ใหม่ (เช่นชื่อ `ai-stock-signal`) — ตั้งเป็น **Public** (เพื่อให้ Actions ฟรีไม่จำกัด)
3. อัปโหลดไฟล์ทั้งหมดในโฟลเดอร์นี้เข้า repo
   (ลากวางผ่านหน้าเว็บ GitHub ได้เลย หรือใช้ `git push`)

### ขั้นที่ 3 — ใส่ Token เป็น Secret (ปลอดภัย ไม่โชว์ในโค้ด)

ใน repo → **Settings → Secrets and variables → Actions → New repository secret**
เพิ่ม 2 ตัว:

| Name | Value |
|------|-------|
| `TELEGRAM_BOT_TOKEN` | token จากขั้นที่ 1 |
| `TELEGRAM_CHAT_ID` | chat id จากขั้นที่ 1 |

### ขั้นที่ 4 — เปิดเว็บ Dashboard (ฟรี)

ใน repo → **Settings → Pages** →
- Source: **Deploy from a branch**
- Branch: **main** / โฟลเดอร์ **/docs** → Save
- รอ ~1 นาที จะได้ลิงก์เว็บ เช่น `https://<username>.github.io/ai-stock-signal/`

### ขั้นที่ 5 — เปิดใช้งานอัตโนมัติ

ใน repo → แท็บ **Actions** → ถ้าถามให้กดยืนยันเปิด workflow → กด **Enable**
- ระบบจะรันเองทุกวันทำการตามเวลาใน [`analyze.yml`](.github/workflows/analyze.yml)
- อยากทดสอบทันที: แท็บ **Actions → AI Stock Signal → Run workflow**

เสร็จแล้ว! 🎉 หลังจากนี้ทุกวันทำการคุณจะได้ข้อความ Telegram + เว็บอัปเดตเอง

---

## 💻 ทดสอบบนเครื่องตัวเอง (ไม่บังคับ)

```bash
pip install -r requirements.txt

# ตั้งค่า token (ถ้าอยากทดสอบการแจ้งเตือน) — ถ้าไม่ตั้งจะข้ามการส่ง
# Windows PowerShell:
$env:TELEGRAM_BOT_TOKEN="ใส่ token"
$env:TELEGRAM_CHAT_ID="ใส่ chat id"

python run.py
```

แล้วเปิด `docs/index.html` ด้วยเบราว์เซอร์เพื่อดู dashboard
(แนะนำเสิร์ฟผ่าน `python -m http.server` ในโฟลเดอร์ `docs/` เพื่อให้ `fetch` ทำงาน)

---

## ⚙️ ปรับแต่ง

แก้ไฟล์ [`config.py`](config.py):

- **เพิ่ม/ลบหุ้น** ที่ `WATCHLIST` (ใส่ `.BK` ต่อท้ายชื่อหุ้นไทยเสมอ)
- **ปรับเกณฑ์สัญญาณ** ที่ `SCORE_STRONG_BUY`, `SCORE_BUY`
- **ปรับความเสี่ยง** ที่ `STOP_LOSS_PCT`, `TARGET1_PCT`, `TARGET2_PCT`
- **เปลี่ยนเวลารัน** แก้ `cron` ใน [`analyze.yml`](.github/workflows/analyze.yml) (เวลาเป็น UTC)

---

## ❓ คำถามที่พบบ่อย

**ฟรีจริงไหม?** ฟรีครับ — GitHub Actions ให้ public repo รันไม่จำกัด, GitHub Pages ฟรี,
Yahoo Finance ดึงข้อมูลฟรี, Telegram bot ฟรี

**ทำไมบาง cron ไม่ตรงเป๊ะ?** GitHub Actions อาจดีเลย์ 5–15 นาทีช่วงเวลาคนใช้เยอะ ถือว่าปกติ

**ข้อมูลหุ้น real-time ไหม?** Yahoo Finance เป็นข้อมูล end-of-day / ดีเลย์ เหมาะกับ
การวางแผนซื้อรอบถัดไป ไม่เหมาะกับเดย์เทรดวินาทีต่อวินาที

**อยากให้ AI เขียนบทวิเคราะห์เป็นภาษาคนด้วย?** ต่อยอดได้โดยเรียก Claude API
(ส่งตัวเลขอินดิเคเตอร์ไปให้สรุปเป็นข้อความ) — แต่ส่วนนี้มีค่าใช้จ่าย API จึงไม่รวมในเวอร์ชันฟรี

---

## 📁 โครงสร้างไฟล์

```
ai-stock-signal/
├── config.py              # รายการหุ้น + เกณฑ์ (แก้ตรงนี้)
├── analyzer.py            # เครื่องวิเคราะห์ technical
├── notifier.py            # ส่ง Telegram
├── run.py                 # เริ่มทำงาน
├── requirements.txt
├── docs/                  # เว็บ dashboard (GitHub Pages)
│   ├── index.html
│   ├── style.css
│   ├── app.js
│   └── data/signals.json  # ผลวิเคราะห์ (อัปเดตอัตโนมัติ)
└── .github/workflows/analyze.yml   # ตั้งเวลารันอัตโนมัติ
```

---

*ลงทุนมีความเสี่ยง ผู้ลงทุนควรศึกษาข้อมูลก่อนตัดสินใจ — เครื่องมือนี้เพื่อการศึกษาเท่านั้น*
