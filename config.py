"""
config.py — ตั้งค่ารายการหุ้นที่จะวิเคราะห์ และเกณฑ์สัญญาณ
แก้ไขไฟล์นี้ได้ตามต้องการ (เพิ่ม/ลบหุ้นในตลาด SET)
สัญลักษณ์ของหุ้นไทยใน Yahoo Finance ต้องมี ".BK" ต่อท้าย เช่น PTT -> PTT.BK

หลักสำคัญ: โปรเจกต์นี้ต้องใช้แหล่งข้อมูล/บริการที่ไม่มีค่าใช้จ่ายเท่านั้น
ห้ามเพิ่ม paid API, paid cloud, subscription data หรือบริการที่ต้องผูก billing เพิ่ม
"""

# ─────────────────────────────────────────────────────────────────────────────
# รายการหุ้นที่จะวิเคราะห์ (Watchlist) — แบ่งเป็น "หมวด" (market)
# หุ้นไทยต้องมี ".BK" ต่อท้าย / หุ้น US ใช้ ticker ตรงๆ (เช่น NVDA)
# ─────────────────────────────────────────────────────────────────────────────
# หมวด 1: หุ้นไทย SET50
WATCHLIST_TH = {
    "ADVANC.BK": "ADVANC",
    "AOT.BK": "AOT",
    "AWC.BK": "AWC",
    "BANPU.BK": "BANPU",
    "BBL.BK": "BBL",
    "BDMS.BK": "BDMS",
    "BEM.BK": "BEM",
    "BGRIM.BK": "BGRIM",
    "BH.BK": "BH",
    "BTS.BK": "BTS",
    "CBG.BK": "CBG",
    "CENTEL.BK": "CENTEL",
    "COM7.BK": "COM7",
    "CPALL.BK": "CPALL",
    "CPF.BK": "CPF",
    "CPN.BK": "CPN",
    "CRC.BK": "CRC",
    "DELTA.BK": "DELTA",
    "EA.BK": "EA",
    "EGCO.BK": "EGCO",
    "GLOBAL.BK": "GLOBAL",
    "GPSC.BK": "GPSC",
    "GULF.BK": "GULF",
    "HMPRO.BK": "HMPRO",
    "INTUCH.BK": "INTUCH",
    "IVL.BK": "IVL",
    "KBANK.BK": "KBANK",
    "KCE.BK": "KCE",
    "KTB.BK": "KTB",
    "KTC.BK": "KTC",
    "LH.BK": "LH",
    "MINT.BK": "MINT",
    "MTC.BK": "MTC",
    "OR.BK": "OR",
    "OSP.BK": "OSP",
    "PTT.BK": "PTT",
    "PTTEP.BK": "PTTEP",
    "PTTGC.BK": "PTTGC",
    "RATCH.BK": "RATCH",
    "SAWAD.BK": "SAWAD",
    "SCB.BK": "SCB",
    "SCC.BK": "SCC",
    "SCGP.BK": "SCGP",
    "TIDLOR.BK": "TIDLOR",
    "TISCO.BK": "TISCO",
    "TOP.BK": "TOP",
    "TRUE.BK": "TRUE",
    "TTB.BK": "TTB",
    "TU.BK": "TU",
    "WHA.BK": "WHA",
}

# หมวด 2: หุ้นต่างประเทศ (US) — เน้นตัวที่ "โมเมนตัม/ผันผวนสูง เหมาะกับการเทรด"
# มีทั้งหุ้นดังและไม่ดัง (growth/momentum/high-beta) — แก้เพิ่ม-ลบได้
# ⚠️ ผลตอบแทนสูง = ความเสี่ยงสูง แกว่งแรงทั้งสองทาง
WATCHLIST_US = {
    "NVDA": "NVDA", "AMD": "AMD", "AVGO": "AVGO", "MU": "MU", "ARM": "ARM",
    "SMCI": "SMCI", "TSM": "TSM", "ASML": "ASML", "QCOM": "QCOM", "LRCX": "LRCX",
    "PLTR": "PLTR", "CRWD": "CRWD", "PANW": "PANW", "NET": "NET", "SNOW": "SNOW",
    "DDOG": "DDOG", "NOW": "NOW", "ANET": "ANET", "VRT": "VRT", "CLS": "CLS",
    "APP": "APP", "CRDO": "CRDO", "TSLA": "TSLA", "META": "META", "NFLX": "NFLX",
    "AMZN": "AMZN", "SHOP": "SHOP", "MELI": "MELI", "COIN": "COIN", "MSTR": "MSTR",
    "HOOD": "HOOD", "SOFI": "SOFI", "AFRM": "AFRM", "RBLX": "RBLX", "CVNA": "CVNA",
    "DKNG": "DKNG", "ONON": "ONON", "DUOL": "DUOL",
}

# เพิ่มจำนวนหุ้นให้กว้างขึ้นโดยยังใช้ Yahoo Finance/yfinance ฟรีเท่านั้น
# ถ้าบาง ticker ไม่มีข้อมูล ระบบจะข้ามและรายงานใน status.json โดยไม่เสียค่าใช้จ่าย
WATCHLIST_TH_MORE = {
    "AAV.BK": "AAV",
    "ACE.BK": "ACE",
    "AEONTS.BK": "AEONTS",
    "AH.BK": "AH",
    "AMATA.BK": "AMATA",
    "AP.BK": "AP",
    "AU.BK": "AU",
    "BA.BK": "BA",
    "BAM.BK": "BAM",
    "BCP.BK": "BCP",
    "BCPG.BK": "BCPG",
    "BCH.BK": "BCH",
    "BEC.BK": "BEC",
    "BJC.BK": "BJC",
    "BLA.BK": "BLA",
    "BPP.BK": "BPP",
    "BRI.BK": "BRI",
    "BTG.BK": "BTG",
    "CHAYO.BK": "CHAYO",
    "CHG.BK": "CHG",
    "CK.BK": "CK",
    "CKP.BK": "CKP",
    "DCC.BK": "DCC",
    "DITTO.BK": "DITTO",
    "DMT.BK": "DMT",
    "DOHOME.BK": "DOHOME",
    "ERW.BK": "ERW",
    "FORTH.BK": "FORTH",
    "GFPT.BK": "GFPT",
    "GGC.BK": "GGC",
    "GUNKUL.BK": "GUNKUL",
    "HANA.BK": "HANA",
    "HENG.BK": "HENG",
    "HUMAN.BK": "HUMAN",
    "ICHI.BK": "ICHI",
    "IIG.BK": "IIG",
    "ILM.BK": "ILM",
    "IRPC.BK": "IRPC",
    "ITC.BK": "ITC",
    "JAS.BK": "JAS",
    "JMART.BK": "JMART",
    "JMT.BK": "JMT",
    "KKP.BK": "KKP",
    "LANNA.BK": "LANNA",
    "MAJOR.BK": "MAJOR",
    "M.BK": "M",
    "MC.BK": "MC",
    "MEGA.BK": "MEGA",
    "NER.BK": "NER",
    "ONEE.BK": "ONEE",
    "ORI.BK": "ORI",
    "PLANB.BK": "PLANB",
    "PRM.BK": "PRM",
    "PSL.BK": "PSL",
    "PTG.BK": "PTG",
    "QH.BK": "QH",
    "RBF.BK": "RBF",
    "RCL.BK": "RCL",
    "RS.BK": "RS",
    "SAK.BK": "SAK",
    "SAPPE.BK": "SAPPE",
    "SINGER.BK": "SINGER",
    "SIRI.BK": "SIRI",
    "SISB.BK": "SISB",
    "SJWD.BK": "SJWD",
    "SNNP.BK": "SNNP",
    "SPALI.BK": "SPALI",
    "SPRC.BK": "SPRC",
    "STA.BK": "STA",
    "STEC.BK": "STEC",
    "STGT.BK": "STGT",
    "SYNEX.BK": "SYNEX",
    "TASCO.BK": "TASCO",
    "THANI.BK": "THANI",
    "TKN.BK": "TKN",
    "TLI.BK": "TLI",
    "TOA.BK": "TOA",
    "TPIPL.BK": "TPIPL",
    "TQM.BK": "TQM",
    "TTA.BK": "TTA",
    "UV.BK": "UV",
    "VGI.BK": "VGI",
    "WHAUP.BK": "WHAUP",
    "ZEN.BK": "ZEN",
}

WATCHLIST_US_MORE = {
    "AAPL": "AAPL",
    "MSFT": "MSFT",
    "GOOGL": "GOOGL",
    "GOOG": "GOOG",
    "ORCL": "ORCL",
    "CRM": "CRM",
    "ADBE": "ADBE",
    "INTU": "INTU",
    "MDB": "MDB",
    "TEAM": "TEAM",
    "ZS": "ZS",
    "OKTA": "OKTA",
    "HUBS": "HUBS",
    "FTNT": "FTNT",
    "MRVL": "MRVL",
    "INTC": "INTC",
    "ALAB": "ALAB",
    "TXN": "TXN",
    "ADI": "ADI",
    "KLAC": "KLAC",
    "AMAT": "AMAT",
    "TER": "TER",
    "WDC": "WDC",
    "STX": "STX",
    "A": "A",
    "AI": "AI",
    "PATH": "PATH",
    "IONQ": "IONQ",
    "RGTI": "RGTI",
    "QBTS": "QBTS",
    "RKLB": "RKLB",
    "ASTS": "ASTS",
    "OKLO": "OKLO",
    "JPM": "JPM",
    "BAC": "BAC",
    "WFC": "WFC",
    "GS": "GS",
    "MS": "MS",
    "V": "V",
    "MA": "MA",
    "PYPL": "PYPL",
    "SQ": "SQ",
    "TOST": "TOST",
    "UPST": "UPST",
    "AXP": "AXP",
    "BLK": "BLK",
    "COST": "COST",
    "WMT": "WMT",
    "TGT": "TGT",
    "HD": "HD",
    "LOW": "LOW",
    "NKE": "NKE",
    "SBUX": "SBUX",
    "MCD": "MCD",
    "CMG": "CMG",
    "KO": "KO",
    "PEP": "PEP",
    "PG": "PG",
    "LULU": "LULU",
    "ELF": "ELF",
    "CELH": "CELH",
    "LLY": "LLY",
    "NVO": "NVO",
    "UNH": "UNH",
    "JNJ": "JNJ",
    "ABBV": "ABBV",
    "MRK": "MRK",
    "PFE": "PFE",
    "TMO": "TMO",
    "ISRG": "ISRG",
    "REGN": "REGN",
    "VRTX": "VRTX",
    "GE": "GE",
    "CAT": "CAT",
    "DE": "DE",
    "BA": "BA",
    "LMT": "LMT",
    "RTX": "RTX",
    "HON": "HON",
    "ETN": "ETN",
    "URI": "URI",
    "XOM": "XOM",
    "CVX": "CVX",
    "COP": "COP",
    "SLB": "SLB",
    "LNG": "LNG",
    "OXY": "OXY",
    "MARA": "MARA",
    "RIOT": "RIOT",
    "CLSK": "CLSK",
    "BABA": "BABA",
    "JD": "JD",
    "PDD": "PDD",
    "BIDU": "BIDU",
    "NIO": "NIO",
    "LI": "LI",
    "XPEV": "XPEV",
}

WATCHLIST_TH.update(WATCHLIST_TH_MORE)
WATCHLIST_US.update(WATCHLIST_US_MORE)

# โครงสร้าง "หมวดตลาด" — ระบบจะวิเคราะห์ทุกหมวดและเขียนไฟล์แยกให้ dashboard
MARKETS = {
    "th": {"name": "หุ้นไทย (SET)", "short": "ไทย", "tag": "TH",
           "currency": "฿", "file": "signals.json", "watchlist": WATCHLIST_TH},
    "us": {"name": "หุ้นต่างประเทศ (US)", "short": "ต่างประเทศ", "tag": "US",
           "currency": "$", "file": "signals_foreign.json", "watchlist": WATCHLIST_US},
}

# รวมทุกหมวด (ใช้กับ backtest / paper trading ที่คีย์ด้วย ticker)
WATCHLIST_ALL = {**WATCHLIST_TH, **WATCHLIST_US}
WATCHLIST = WATCHLIST_TH  # backward-compat (โค้ดเก่าที่อ้าง config.WATCHLIST)

# ─────────────────────────────────────────────────────────────────────────────
# พารามิเตอร์ของอินดิเคเตอร์ทางเทคนิค
# ─────────────────────────────────────────────────────────────────────────────
HISTORY_PERIOD = "8mo"   # ระยะเวลาข้อมูลย้อนหลังที่ดึงมาคำนวณ
EMA_FAST = 20            # เส้นค่าเฉลี่ยระยะสั้น
EMA_SLOW = 50            # เส้นค่าเฉลี่ยระยะกลาง
RSI_PERIOD = 14
MACD_FAST = 12
MACD_SLOW = 26
MACD_SIGNAL = 9
VOLUME_LOOKBACK = 20     # ใช้หาค่าเฉลี่ยวอลุ่ม

# ─────────────────────────────────────────────────────────────────────────────
# เกณฑ์การจัดประเภทสัญญาณ (จากคะแนน 0-100)
# ─────────────────────────────────────────────────────────────────────────────
SCORE_STRONG_BUY = 75
SCORE_BUY = 60
SCORE_WATCH = 45
# ต่ำกว่า SCORE_WATCH = AVOID (เลี่ยง)

# จะส่งแจ้งเตือน Telegram เฉพาะหุ้นที่คะแนน >= ค่านี้
NOTIFY_MIN_SCORE = SCORE_BUY

# ─────────────────────────────────────────────────────────────────────────────
# การบริหารความเสี่ยง (ใช้ประเมินจุด stop loss / เป้าหมายเท่านั้น — ไม่ใช่คำสั่งซื้อ)
# ─────────────────────────────────────────────────────────────────────────────
STOP_LOSS_PCT = 0.07     # ตัดขาดทุนที่ -7% (หรือใต้ swing low ล่าสุด แล้วแต่ค่าไหนใกล้กว่า)
TARGET1_PCT = 0.10       # เป้าหมายแรก +10%
TARGET2_PCT = 0.20       # เป้าหมายที่สอง +20%

# ─────────────────────────────────────────────────────────────────────────────
# การทดสอบย้อนหลัง (Backtest)
# จำลองว่า "ถ้าเดินตามสัญญาณนี้ในอดีต ผลจะเป็นยังไง"
# ⚠️ ผลในอดีตไม่การันตีอนาคต และยังไม่รวมค่าคอมมิชชั่น/สลิปเพจ
# ─────────────────────────────────────────────────────────────────────────────
BACKTEST_PERIOD = "2y"      # ช่วงข้อมูลย้อนหลังที่ใช้ทดสอบ
BACKTEST_ENTRY_SCORE = SCORE_BUY   # คะแนนขั้นต่ำที่ถือว่าเป็นสัญญาณเข้าซื้อ
BACKTEST_MAX_HOLD = 20      # ถือสูงสุดกี่วันทำการก่อนปิดออก (ถ้ายังไม่ชน stop/target)

# ─────────────────────────────────────────────────────────────────────────────
# ต้นทุนการเทรด (ค่าคอมมิชชั่น + VAT + slippage) — ใช้ทั้ง backtest และ paper trading
# ปรับตามโบรกเกอร์จริงของคุณ (ไทยทั่วไป ~0.157% + VAT ต่อรอบ; รวมไป-กลับ + slippage ~0.5%)
# ─────────────────────────────────────────────────────────────────────────────
COST_ROUNDTRIP_PCT = 0.005   # ต้นทุนไป-กลับ ~0.5%

# ─────────────────────────────────────────────────────────────────────────────
# การคำนวณขนาดไม้ (Position Sizing) — บริหารความเสี่ยงต่อไม้
# ─────────────────────────────────────────────────────────────────────────────
ACCOUNT_SIZE = 100000        # ขนาดพอร์ตสมมติ (บาท) ใช้คำนวณขนาดไม้
RISK_PER_TRADE_PCT = 0.02    # เสี่ยงต่อไม้ไม่เกิน 2% ของพอร์ต
BOARD_LOT = 100              # 1 board lot = 100 หุ้น (ปัดลงให้ลงตัว)

# ─────────────────────────────────────────────────────────────────────────────
# พฤติกรรมการแจ้งเตือน (กันสแปม + heartbeat)
# ─────────────────────────────────────────────────────────────────────────────
ALERT_ONLY_CHANGES = True    # แจ้งเฉพาะสัญญาณ "ใหม่/เปลี่ยนระดับ/หมดอายุ" เท่านั้น
SEND_HEARTBEAT = True        # แนบบรรทัดยืนยัน "ระบบทำงานปกติ" ท้ายข้อความ
FETCH_FAIL_WARN_RATIO = 0.5  # ถ้าดึงข้อมูลล้มเกินสัดส่วนนี้ ส่งเตือนว่าข้อมูลมีปัญหา
WATCHDOG_MAX_AGE_HOURS = 30  # ถ้า status ล่าสุดเก่ากว่านี้ ให้ watchdog แจ้งเตือน
SELF_HEAL_RETRY_SECONDS = 60  # รอก่อนลองซ่อมซ้ำเมื่อแหล่งข้อมูลล่มชั่วคราว
SELF_HEAL_MAX_ATTEMPTS = 2    # จำนวนครั้งสูงสุดที่ self-heal จะลองรัน pipeline

# ─────────────────────────────────────────────────────────────────────────────
# ตัวกรองภาวะตลาด (Market Regime) — ไม่สวนกระแสตลาดใหญ่
# วัดจาก breadth = สัดส่วนหุ้นในลิสต์ที่ยืนเหนือ EMA20
# ─────────────────────────────────────────────────────────────────────────────
REGIME_ENABLED = True
REGIME_BULL_BREADTH = 60     # breadth >= 60% = ตลาดขาขึ้น (risk-on)
REGIME_BEAR_BREADTH = 40     # breadth <= 40% = ตลาดขาลง (ระวัง)
REGIME_BEAR_MIN_SCORE = SCORE_STRONG_BUY  # ตลาดขาลง: แจ้งเฉพาะสัญญาณแข็งแรงมากเท่านั้น

# ─────────────────────────────────────────────────────────────────────────────
# ตัววัดผลจริง (Paper-trading tracker) — บันทึกสัญญาณจริงแล้ววัด hit-rate จริง
# ─────────────────────────────────────────────────────────────────────────────
TRACKER_ENABLED = True
TRACKER_MAX_HOLD = BACKTEST_MAX_HOLD  # ถือ paper position สูงสุดกี่วันก่อนปิด

# โฟลเดอร์เก็บ state ภายใน (GitHub Actions จะ commit กลับ)
STATE_DIR = "state"

# ─────────────────────────────────────────────────────────────────────────────
# โหมดอัปเดตอัตโนมัติบนเครื่องตัวเอง (auto_run.py)
# ⚠️ ข้อมูล Yahoo ดีเลย์ ~15-20 นาที และอินดิเคเตอร์เป็นรายวัน — รันถี่ไม่ได้ข้อมูลใหม่มากนัก
#    ตั้ง 60 วินาทีตามที่ผู้ใช้ขอ แต่จะรันเฉพาะเวลาตลาดเปิดเพื่อกัน Yahoo บล็อก
# ─────────────────────────────────────────────────────────────────────────────
AUTO_INTERVAL_SECONDS = 60        # รอบการอัปเดต (วินาที) — เพิ่มเป็น 300 ถ้าโดน Yahoo จำกัด
AUTO_ONLY_MARKET_HOURS = True     # รันเฉพาะเวลาตลาด SET เปิด (กันยิงข้อมูลตอนตลาดปิด)

# ─────────────────────────────────────────────────────────────────────────────
# ข่าวประกอบ (News) — ดึงข่าวล่าสุดต่อหุ้นจาก Google News (ฟรี ไม่ต้องใช้ API key)
# ช่วยให้ดูบริบทว่า "ทำไมราคาขึ้น/ลง" — แต่ข่าวเป็นบริบท ไม่ใช่สาเหตุที่พิสูจน์แล้ว
# ─────────────────────────────────────────────────────────────────────────────
NEWS_ENABLED = True
NEWS_MAX_ITEMS = 4            # จำนวนหัวข้อข่าวต่อหุ้น
NEWS_TTL_MINUTES = 30        # cache ข่าวนานเท่าไรก่อนดึงใหม่ (กันยิงถี่ตอนรันลูปทุก 1 นาที)
NEWS_FETCH_LIMIT = 50        # ดึงข่าว "ใหม่" สูงสุดกี่หุ้นต่อรอบ (ที่เหลือใช้ cache) — กัน rate limit
