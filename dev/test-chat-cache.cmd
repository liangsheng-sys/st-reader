@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0.."
node "%~dp0test-performance.mjs" --chat-cache --core-browser
set "STCR_RESULT=%ERRORLEVEL%"
echo.
if "%STCR_RESULT%"=="0" (echo T53 OK.) else (echo T53 FAILED. Please keep the report in .dev/fixtures/t53-performance-result.json.)
pause
exit /b %STCR_RESULT%
