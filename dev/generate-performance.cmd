@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0.."
node "%~dp0fixtures\performance.mjs"
set "STCR_RESULT=%ERRORLEVEL%"
echo.
if "%STCR_RESULT%"=="0" (echo 大文件已就绪，请双击 start-dev-st.cmd，再双击 test-performance.cmd。) else (echo 请先停止开发实例，再重试；上方是具体原因。)
pause
exit /b %STCR_RESULT%
