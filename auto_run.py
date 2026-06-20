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
    """
    เปิดทำงานช่วงที่ตลาดเปิด (เวลาไทย) เพื่อกัน Yahoo บล็อกตอนตลาดปิด:
      SET (จ.-ศ.): 10:00-12:30 และ 14:30-16:30
      US  (โดยประมาณตามเวลาไทย): ~20:30 เป็นต้นไป (เย็น จ.-ศ.) ถึง ~03:00 (เช้ามืด อ.-ส.)
    """
    wd = now.weekday()             # 0=จันทร์ ... 6=อาทิตย์
    t = now.hour * 60 + now.minute
    # SET (จ.-ศ.)
    if wd <= 4 and ((9 * 60 + 55) <= t <= (12 * 60 + 35)
                    or (14 * 60 + 25) <= t <= (16 * 60 + 35)):
        return True
    # US ภาคค่ำของไทย (จ.-ศ.)
    if wd <= 4 and t >= (20 * 60 + 30):
        return True
    # US ช่วงเช้ามืดของไทย (อ.-ส. = คืนวันทำการของ US)
    if 1 <= wd <= 5 and t <= (3 * 60):
        return True
    return False


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
