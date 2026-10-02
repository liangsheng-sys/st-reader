@rem ST Reader - AGPL-3.0
@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0.."
node "%~dp0test-performance.mjs" --update-service --core-browser
set "STCR_RESULT=%ERRORLEVEL%"
echo.
if "%STCR_RESULT%"=="0" (echo T54a OK.) else (echo T54a FAILED. See details above.)
pause
exit /b %STCR_RESULT%
