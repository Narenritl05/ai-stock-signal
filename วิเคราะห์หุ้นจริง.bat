@echo off
chcp 65001 >nul
title AI Stock Signal - วิเคราะห์หุ้นจริง
cd /d "%~dp0"
echo ==================================================
echo   AI Stock Signal — วิเคราะห์หุ้น SET จริง
echo ==================================================
echo.
echo  *** อย่าปิดหน้าต่างนี้จนกว่าเบราว์เซอร์จะเปิดขึ้นมา ***
echo.
echo  [1/3] ตรวจสอบ/ติดตั้งไลบรารี (ครั้งแรกหลายนาที โปรดรอ ห้ามปิด)...
python -m pip install -r requirements.txt
if errorlevel 1 goto error
echo.
echo  [2/3] กำลังดึงราคาหุ้น SET และวิเคราะห์ (1-2 นาที)...
python run.py
if errorlevel 1 goto error
echo.
echo  [3/3] วิเคราะห์เสร็จ! กำลังเปิดหน้าเว็บ Dashboard...
echo        (ถ้าหน้าเว็บยังไม่ขึ้น กด F5 หนึ่งครั้ง)
echo        ** ปิดโปรแกรม = ปิดหน้าต่างนี้ **
start "" http://localhost:8765
python -m http.server 8765 --directory "%~dp0docs"
goto end

:error
echo.
echo ==================================================
echo   เกิดข้อผิดพลาด! กรุณาถ่ายรูปข้อความข้างบนส่งให้ผู้ดูแล
echo   (อย่าเพิ่งปิด — อ่านข้อความข้างบนก่อน)
echo ==================================================
echo.
pause

:end
