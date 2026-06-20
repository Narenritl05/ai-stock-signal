@echo off
chcp 65001 >nul
title AI Stock Signal - Dashboard
echo ==================================================
echo   AI Stock Signal — เปิดหน้าเว็บ Dashboard
echo --------------------------------------------------
echo   กำลังเปิดเบราว์เซอร์... ถ้ายังไม่ขึ้น กด F5 (refresh)
echo   ** ปิดโปรแกรม = ปิดหน้าต่างสีดำนี้ **
echo ==================================================
start "" http://localhost:8765
python -m http.server 8765 --directory "%~dp0docs"
