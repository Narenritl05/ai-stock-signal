@echo off
chcp 65001 >nul
title AI Stock Signal - Dashboard
cd /d "%~dp0docs"
echo ==================================================
echo   AI Stock Signal — เปิดหน้าเว็บ Dashboard
echo --------------------------------------------------
echo   กำลังเปิดเบราว์เซอร์ที่ http://localhost:8765
echo   ** ปิดโปรแกรม: ปิดหน้าต่างสีดำนี้ **
echo ==================================================
timeout /t 1 >nul
start "" http://localhost:8765
python -m http.server 8765
