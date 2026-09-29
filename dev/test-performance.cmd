@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0.."
node "%~dp0test-performance.mjs"
set "STCR_RESULT=%ERRORLEVEL%"
echo.
if "%STCR_RESULT%"=="0" (echo 性能验收通过。) else (echo 请把上方报错发给工程师。)
pause
exit /b %STCR_RESULT%
