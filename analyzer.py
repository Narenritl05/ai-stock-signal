"""
analyzer.py — เครื่องวิเคราะห์หุ้นด้วย Technical Analysis

หลักการ: รวมสัญญาณจากหลายอินดิเคเตอร์ (เทรนด์ EMA, RSI, MACD, วอลุ่ม, โมเมนตัม)
ให้คะแนน 0-100 แล้วแปลงเป็นสัญญาณ STRONG BUY / BUY / WATCH / AVOID

โครงสร้าง (ใช้ร่วมกับ backtest.py):
  compute_indicators(df) -> ตาราง indicator ทั้งหมด
  score_point(...)        -> ให้คะแนน ณ จุดเวลาหนึ่ง (ใช้ทั้งวิเคราะห์สดและ backtest)
  analyze_one(...)        -> วิเคราะห์หุ้น 1 ตัว (สถานะล่าสุด)

⚠️ นี่คือ "ตัวช่วยคัดกรอง" ไม่ใช่การการันตีกำไร — ไม่มีระบบใดทำนายตลาดได้ 100%
"""
from __future__ import annotations

import math

import numpy as np
import pandas as pd

try:
    import yfinance as yf
except ImportError:  # ให้ไฟล์ import ได้แม้ยังไม่ติดตั้ง yfinance (เช่นตอนรันเทสต์)
    yf = None

import config


# ─────────────────────────────────────────────────────────────────────────────
# ตัวคำนวณอินดิเคเตอร์ (เขียนเองด้วย pandas เพื่อลด dependency)
# ─────────────────────────────────────────────────────────────────────────────
def ema(series: pd.Series, span: int) -> pd.Series:
    return series.ewm(span=span, adjust=False).mean()


def rsi(series: pd.Series, period: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.clip(lower=0.0)
    loss = -delta.clip(upper=0.0)
    avg_gain = gain.ewm(alpha=1.0 / period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1.0 / period, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    out = 100 - (100 / (1 + rs))
    return out.fillna(50.0)


def macd(series: pd.Series, fast: int, slow: int, signal: int):
    macd_line = ema(series, fast) - ema(series, slow)
    signal_line = ema(macd_line, signal)
    hist = macd_line - signal_line
    return macd_line, signal_line, hist


def _safe(x, default=0.0):
    try:
        v = float(x)
        return default if math.isnan(v) else v
    except (TypeError, ValueError):
        return default


# ─────────────────────────────────────────────────────────────────────────────
# คำนวณอินดิเคเตอร์ทั้งชุดเป็นตาราง (ใช้ทั้งวิเคราะห์สดและ backtest)
# ─────────────────────────────────────────────────────────────────────────────
def compute_indicators(df: pd.DataFrame) -> pd.DataFrame:
    close = df["Close"]
    volume = df["Volume"]
    out = pd.DataFrame(index=df.index)
    out["close"] = close
    out["ema_fast"] = ema(close, config.EMA_FAST)
    out["ema_slow"] = ema(close, config.EMA_SLOW)
    out["rsi"] = rsi(close, config.RSI_PERIOD)
    _, _, hist = macd(close, config.MACD_FAST, config.MACD_SLOW, config.MACD_SIGNAL)
    out["macd_hist"] = hist
    out["vol"] = volume
    out["vol_avg"] = volume.rolling(config.VOLUME_LOOKBACK).mean()
    out["mom5"] = close.pct_change(5) * 100
    return out


# ─────────────────────────────────────────────────────────────────────────────
# ตรรกะการให้คะแนน ณ จุดเวลาหนึ่ง — แหล่งความจริงเดียว (single source of truth)
# with_text=False จะข้ามการสร้างข้อความเหตุผล (เร็วขึ้น ใช้ตอน backtest)
# ─────────────────────────────────────────────────────────────────────────────
def score_point(price, prev_price, ef, es, r, h, h_prev, vol_ratio, mom5, with_text=True):
    score = 0.0
    reasons: list[str] = []
    warnings: list[str] = []

    def add_reason(t):
        if with_text:
            reasons.append(t)

    def add_warn(t):
        if with_text:
            warnings.append(t)

    # 1) เทรนด์จากเส้นค่าเฉลี่ย (สูงสุด 30)
    if price > ef > es:
        score += 30
        add_reason("ราคายืนเหนือ EMA20 และ EMA50 (เทรนด์ขาขึ้นชัด)")
        trend = "UP"
    elif price > ef:
        score += 16
        add_reason("ราคายืนเหนือ EMA20 (เริ่มฟื้นตัว)")
        trend = "UP-WEAK"
    elif price < ef < es:
        add_warn("ราคาอยู่ใต้ EMA20/50 (เทรนด์ขาลง)")
        trend = "DOWN"
    else:
        trend = "SIDEWAYS"

    # 2) RSI (สูงสุด 18)
    if 45 <= r <= 65:
        score += 18
        add_reason(f"RSI {r:.0f} อยู่โซนแข็งแรงแต่ยังไม่ร้อนแรงเกินไป")
    elif 35 <= r < 45:
        score += 12
        add_reason(f"RSI {r:.0f} เริ่มฟื้นจากโซนขายมากเกินไป")
    elif r < 35:
        score += 8
        add_reason(f"RSI {r:.0f} โซน oversold — มีโอกาสเด้ง แต่ต้องรอสัญญาณยืนยัน")
    elif r > 75:
        score -= 12
        add_warn(f"RSI {r:.0f} ร้อนแรงเกินไป (overbought) เสี่ยงย่อตัว")
    elif r > 70:
        add_warn(f"RSI {r:.0f} เริ่มเข้าโซน overbought")

    # 3) MACD (สูงสุด 22)
    if h > 0 and h > h_prev:
        score += 22
        add_reason("MACD เป็นบวกและกำลังเพิ่มขึ้น (โมเมนตัมขาขึ้น)")
    elif h > 0:
        score += 14
        add_reason("MACD อยู่ฝั่งบวก")
    elif h < 0 and h > h_prev:
        score += 8
        add_reason("MACD ติดลบแต่กำลังหดตัว (อาจกำลังกลับตัว)")
    else:
        add_warn("MACD ฝั่งลบและยังอ่อนแรง")

    # 4) วอลุ่ม (สูงสุด 13)
    if vol_ratio >= 1.8:
        score += 13
        add_reason(f"วอลุ่มพุ่ง {vol_ratio:.1f} เท่าของค่าเฉลี่ย (มีแรงซื้อเข้า)")
    elif vol_ratio >= 1.3:
        score += 8
        add_reason(f"วอลุ่มสูงกว่าค่าเฉลี่ย {vol_ratio:.1f} เท่า")
    elif vol_ratio < 0.6:
        add_warn("วอลุ่มเบาบาง สภาพคล่องต่ำ")

    # 5) โมเมนตัมระยะสั้น (สูงสุด 12)
    if mom5 > 5:
        score += 12
        add_reason(f"ราคา +{mom5:.1f}% ใน 5 วัน (โมเมนตัมแรง)")
    elif mom5 > 1:
        score += 7
        add_reason(f"ราคา +{mom5:.1f}% ใน 5 วัน")
    elif mom5 < -5:
        add_warn(f"ราคา {mom5:.1f}% ใน 5 วัน (กำลังร่วง)")

    score = max(0, min(100, round(score)))

    if score >= config.SCORE_STRONG_BUY:
        sig = "STRONG BUY"
    elif score >= config.SCORE_BUY:
        sig = "BUY"
    elif score >= config.SCORE_WATCH:
        sig = "WATCH"
    else:
        sig = "AVOID"

    return score, sig, trend, reasons, warnings


# ─────────────────────────────────────────────────────────────────────────────
# ดึงข้อมูลราคา
# ─────────────────────────────────────────────────────────────────────────────
def fetch_history(ticker: str, period: str | None = None) -> pd.DataFrame | None:
    if yf is None:
        raise RuntimeError("ยังไม่ได้ติดตั้ง yfinance — รัน: pip install -r requirements.txt")
    period = period or config.HISTORY_PERIOD
    try:
        df = yf.download(
            ticker, period=period, interval="1d",
            progress=False, auto_adjust=True, threads=False,
        )
    except Exception as e:  # network / symbol error
        print(f"  [warn] ดึงข้อมูล {ticker} ไม่สำเร็จ: {e}")
        return None
    if df is None or df.empty:
        return None
    # yfinance บางเวอร์ชันคืน MultiIndex columns -> ปรับให้เป็นชั้นเดียว
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)
    df = df.dropna()
    if len(df) < config.EMA_SLOW + 5:  # ข้อมูลน้อยเกินไป คำนวณไม่น่าเชื่อถือ
        return None
    return df


# ─────────────────────────────────────────────────────────────────────────────
# วิเคราะห์หุ้น 1 ตัว (สถานะล่าสุด)
# ─────────────────────────────────────────────────────────────────────────────
def analyze_one(ticker: str, name: str) -> dict | None:
    df = fetch_history(ticker)
    if df is None:
        return None

    ind = compute_indicators(df)
    last = ind.iloc[-1]
    prev = ind.iloc[-2]

    price = _safe(last["close"])
    prev_price = _safe(prev["close"], price)
    change_pct = ((price - prev_price) / prev_price * 100) if prev_price else 0.0
    ef = _safe(last["ema_fast"])
    es = _safe(last["ema_slow"])
    r = _safe(last["rsi"], 50.0)
    h = _safe(last["macd_hist"])
    h_prev = _safe(prev["macd_hist"])
    vol_avg = _safe(last["vol_avg"], _safe(last["vol"]))
    vol_ratio = (_safe(last["vol"]) / vol_avg) if vol_avg else 1.0
    mom5 = _safe(last["mom5"])

    score, sig, trend, reasons, warnings = score_point(
        price, prev_price, ef, es, r, h, h_prev, vol_ratio, mom5
    )

    # จุด stop loss: เลือกจุดที่ใกล้ราคากว่า ระหว่าง swing low 20 วัน กับ -STOP_LOSS_PCT
    swing_low = _safe(df["Close"].tail(20).min(), price * (1 - config.STOP_LOSS_PCT))
    pct_stop = price * (1 - config.STOP_LOSS_PCT)
    stop_loss = max(swing_low, pct_stop)
    if stop_loss >= price:
        stop_loss = pct_stop

    return {
        "ticker": ticker,
        "name": name,
        "price": round(price, 2),
        "change_pct": round(change_pct, 2),
        "score": score,
        "signal": sig,
        "trend": trend,
        "rsi": round(r, 1),
        "macd_hist": round(h, 4),
        "volume_ratio": round(vol_ratio, 2),
        "momentum_5d": round(mom5, 2),
        "entry": round(price, 2),
        "stop_loss": round(stop_loss, 2),
        "target1": round(price * (1 + config.TARGET1_PCT), 2),
        "target2": round(price * (1 + config.TARGET2_PCT), 2),
        "reasons": reasons,
        "warnings": warnings,
    }


def analyze_watchlist(watchlist: dict | None = None) -> list[dict]:
    watchlist = watchlist or config.WATCHLIST
    results: list[dict] = []
    for ticker, name in watchlist.items():
        print(f"  วิเคราะห์ {name} ({ticker}) ...")
        try:
            res = analyze_one(ticker, name)
        except Exception as e:
            print(f"  [error] {ticker}: {e}")
            res = None
        if res:
            results.append(res)
    results.sort(key=lambda x: x["score"], reverse=True)
    return results
