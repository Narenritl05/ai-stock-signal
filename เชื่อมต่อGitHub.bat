@echo off
echo ==================================================
echo   Connect your GitHub account (one time)
echo --------------------------------------------------
echo   1) A one-time code appears below (e.g. ABCD-1234)
echo   2) Press Enter to open the browser
echo   3) Paste the code, then click Authorize
echo   4) Come back here - you should see "Logged in as ..."
echo ==================================================
echo.
"C:\Program Files\GitHub CLI\gh.exe" auth login --hostname github.com --git-protocol https --web
echo.
echo ==================================================
echo   If you see "Logged in as ...", you are DONE.
echo   Tell Claude: "login done"
echo ==================================================
pause
