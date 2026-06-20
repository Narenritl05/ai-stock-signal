@echo off
chcp 65001 >nul
title AI Stock Signal - Telegram Bot
cd /d "%~dp0"
echo ==================================================
echo   AI Stock Signal - Telegram Bot
echo ==================================================
echo.
echo เปิดหน้าต่างนี้ค้างไว้ เพื่อให้ Telegram ตอบคำถามหุ้นได้
echo ตัวอย่างใน Telegram: AOT, PTT, NVDA หรือ /stock AOT
echo.
echo ถ้าปิดหน้าต่างนี้ บอทจะหยุดตอบคำถาม
echo ==================================================
echo.
python telegram_bot.py
echo.
echo บอทหยุดทำงานแล้ว
pause
