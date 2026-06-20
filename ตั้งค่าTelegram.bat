@echo off
chcp 65001 >nul
title ตั้งค่า Telegram
cd /d "%~dp0"
echo ==================================================
echo   ตั้งค่าการแจ้งเตือนผ่าน Telegram
echo ==================================================
echo.
echo  หาข้อมูล 2 อย่างนี้ก่อน (ทำใน Telegram):
echo   1) BOT TOKEN : แชทหา  @BotFather  แล้วพิมพ์  /newbot  ตั้งชื่อบอท
echo                  จะได้รหัสหน้าตาแบบ  123456789:AAH....
echo   2) CHAT ID   : แชทหา  @userinfobot  แล้วกด Start จะได้ตัวเลข
echo   *** อย่าลืมกด /start ในแชทบอทที่สร้าง 1 ครั้ง ไม่งั้นบอทส่งหาไม่ได้ ***
echo.
echo --------------------------------------------------
set /p TOKEN=วาง BOT TOKEN แล้วกด Enter:
set /p CHATID=วาง CHAT ID แล้วกด Enter:
(echo BOT_TOKEN=%TOKEN%)>telegram.txt
(echo CHAT_ID=%CHATID%)>>telegram.txt
echo.
echo บันทึกลงไฟล์ telegram.txt แล้ว — กำลังทดสอบส่งข้อความ...
echo.
python -c "import notifier; ok=notifier.send_telegram('✅ เชื่อมต่อ AI Stock Signal สำเร็จ! ระบบพร้อมส่งแจ้งเตือนแล้ว'); print('>>> ส่งสำเร็จ! เช็คใน Telegram ได้เลย' if ok else '>>> ส่งไม่สำเร็จ - ตรวจ TOKEN/CHAT ID แล้วลองใหม่')"
echo.
echo ==================================================
echo   เสร็จแล้ว! ต่อไปเวลารัน วิเคราะห์หุ้นจริง.bat
echo   จะส่งแจ้งเตือนเข้า Telegram ให้อัตโนมัติ
echo ==================================================
pause
