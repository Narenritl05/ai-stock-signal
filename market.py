"""
market.py — ตัวกรองภาวะตลาด (Market Regime) + คำนวณขนาดไม้ (Position Sizing)

Regime: วัดจาก breadth = สัดส่วนหุ้นในลิสต์ที่ยืนเหนือ EMA20 (เทรนด์ UP/UP-WEAK)
  BULL    — ตลาดส่วนใหญ่ขาขึ้น ปล่อยสัญญาณซื้อได้ตามปกติ
  NEUTRAL — ไซด์เวย์ ระวังเป็นพิเศษ
  BEAR    — ตลาดส่วนใหญ่ขาลง แจ้งเฉพาะสัญญาณแข็งแรงมากเท่านั้น (กันโดนหลอกเด้ง)

⚠️ การไม่สวนตลาดใหญ่ช่วย "ลดโอกาสขาดทุน" ไม่ใช่รับประกันกำไร
"""
from __future__ import annotations

import config

UPTREND = ("UP", "UP-WEAK")


def assess_regime(signals: list[dict]) -> dict:
    n = len(signals)
    if n == 0:
        return {"regime": "UNKNOWN", "breadth": 0.0, "label": "ไม่ทราบภาวะตลาด",
                "stocks": 0, "uptrend": 0}
    uptrend = sum(1 for s in signals if s.get("trend") in UPTREND)
    breadth = round(uptrend / n * 100, 1)
    if breadth >= config.REGIME_BULL_BREADTH:
        regime, label = "BULL", "ตลาดขาขึ้น (Risk-on)"
    elif breadth <= config.REGIME_BEAR_BREADTH:
        regime, label = "BEAR", "ตลาดขาลง — ระวังสัญญาณซื้อ"
    else:
        regime, label = "NEUTRAL", "ตลาดไซด์เวย์ — เลือกเฉพาะตัวแข็งแรง"
    return {"regime": regime, "breadth": breadth, "label": label,
            "stocks": n, "uptrend": uptrend}


def notify_min_score(regime: dict | None) -> int:
    """ในตลาดขาลง ยกระดับเกณฑ์แจ้งเตือนให้เข้มขึ้น"""
    if regime and regime.get("regime") == "BEAR":
        return config.REGIME_BEAR_MIN_SCORE
    return config.NOTIFY_MIN_SCORE


def position_size(entry: float, stop: float) -> dict:
    """
    คำนวณขนาดไม้จากความเสี่ยงต่อไม้:
      เงินเสี่ยงต่อไม้ = พอร์ต × RISK_PER_TRADE_PCT
      จำนวนหุ้น       = เงินเสี่ยง ÷ (ราคาเข้า − จุดตัดขาดทุน)  แล้วปัดลงเป็น board lot
    """
    risk_amount = config.ACCOUNT_SIZE * config.RISK_PER_TRADE_PCT
    per_share_risk = max(entry - stop, 0.01)
    raw = risk_amount / per_share_risk
    shares = int(raw // config.BOARD_LOT * config.BOARD_LOT)
    value = round(shares * entry, 2)
    return {
        "shares": shares,
        "value": value,
        "risk_amount": round(risk_amount, 2),
        "risk_per_share": round(per_share_risk, 2),
    }
