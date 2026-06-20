"""
auto_run.py — รันวิเคราะห์ซ้ำอัตโนมัติทุก N วินาที (สำหรับรันบนเครื่องตัวเอง)

- รอบเวลา: config.AUTO_INTERVAL_SECONDS (ค่าเริ่มต้น 60 วินาที)
- รันเฉพาะช่วงตลาด SET เปิด (ถ้า config.AUTO_ONLY_MARKET_HOURS = True) เพื่อกัน Yahoo บล็อก
- ไม่สแปม Telegram: แจ้งเฉพาะตอนมีสัญญาณเปลี่ยนจริง (run_pipeline(notify_no_changes=False))

⚠️ ทำงานเฉพาะตอนเปิดคอมและหน้าต่างนี้เปิดอยู่ — ปิดหน้าต่าง = หยุด
   ข้อมูล Yahoo ดีเลย์ ~15-20 นาที และอินดิเคเตอร์เป็นรายวัน จึงเปลี่ยนช้า
"""
from __future__ import annotations

import time
from datetime import datetime, timezone, timedelta

import config
import run

ICT = timezone(timedelta(hours=7))


def market_open(now: datetime) -> bool:
    """ตลาด SET: จ.-ศ. 10:00-12:30 และ 14:30-16:30 (เผื่อหัว-ท้ายเล็กน้อย)"""
    if now.weekday() >= 5:          # เสาร์/อาทิตย์
        return False
    t = now.hour * 60 + now.minute
    morning = (9 * 60 + 55) <= t <= (12 * 60 + 35)
    afternoon = (14 * 60 + 25) <= t <= (16 * 60 + 35)
    return morning or afternoon


def main() -> None:
    interval = config.AUTO_INTERVAL_SECONDS
    guard = config.AUTO_ONLY_MARKET_HOURS
    print("=" * 60)
    print(f"โหมดอัปเดตอัตโนมัติ — ทุก {interval} วินาที")
    print(f"รันเฉพาะเวลาตลาดเปิด: {'ใช่' if guard else 'ไม่ (รันตลอด)'}")
    print("ปิดโปรแกรม = ปิดหน้าต่างนี้")
    print("=" * 60)

    while True:
        now = datetime.now(ICT)
        if guard and not market_open(now):
            print(f"[{now:%H:%M:%S}] ตลาดปิด — รอรอบถัดไป ({interval}s)")
        else:
            try:
                run.run_pipeline(notify_no_changes=False)
            except Exception as e:
                print(f"[{now:%H:%M:%S}] ผิดพลาด: {e}")
        time.sleep(interval)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nหยุดการทำงาน")
