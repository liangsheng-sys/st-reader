@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0.."
node "%~dp0fixtures\gen.mjs"
if errorlevel 1 goto end
node "%~dp0selftest.mjs"
:end
echo.
echo [st-reader] 生成与检查已结束。请查看上方是否全部通过，再双击 start-dev-st.cmd。
pause
