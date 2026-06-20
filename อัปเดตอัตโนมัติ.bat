@echo off
chcp 65001 >nul
title AI Stock Signal - อัปเดตอัตโนมัติ
cd /d "%~dp0"
echo ==================================================
echo   AI Stock Signal — โหมดอัปเดตอัตโนมัติทุก 1 นาที
echo --------------------------------------------------
echo   * อัปเดตเฉพาะเวลาตลาด SET เปิด (10:00-12:30, 14:30-16:30)
echo   * ปิดโปรแกรม = ปิดหน้าต่างนี้ (และหน้าต่างเว็บเซิร์ฟเวอร์)
echo ==================================================
echo.
echo  [1/2] ตรวจสอบ/ติดตั้งไลบรารี...
python -m pip install -q -r requirements.txt
echo.
echo  [2/2] เปิดหน้าเว็บ + เริ่มลูปวิเคราะห์อัตโนมัติ...
start "AI Stock Signal - เว็บเซิร์ฟเวอร์ (ห้ามปิด)" python -m http.server 8765 --directory "%~dp0docs"
timeout /t 2 >nul
start "" http://localhost:8765
echo.
python auto_run.py
