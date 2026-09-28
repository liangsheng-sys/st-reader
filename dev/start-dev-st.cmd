@echo off
setlocal
chcp 65001 >nul
title ST Reader 开发实例 - 8100
cd /d "%~dp0.."
where node >nul 2>nul
if errorlevel 1 (
    echo [st-reader] 未找到 Node.js。请先确认已安装的 Node 24 能正常运行。
    pause
    exit /b 1
)
node "%~dp0start-dev-st.mjs" %*
set "STCR_EXIT=%ERRORLEVEL%"
if "%~1"=="--prepare-only" exit /b %STCR_EXIT%
if "%~1"=="--no-pause" exit /b %STCR_EXIT%
echo.
echo [st-reader] 开发实例已停止。若上方有错误，请把错误文字发给工程师。
pause
exit /b %STCR_EXIT%
