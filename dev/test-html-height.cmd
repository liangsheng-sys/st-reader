@rem ST Reader - AGPL-3.0
@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0.."
node "%~dp0test-performance.mjs" --html-height --core-browser
set "STCR_RESULT=%ERRORLEVEL%"
echo.
if "%STCR_RESULT%"=="0" (echo I041 OK.) else (echo I041 FAILED. See the report in .dev/fixtures/i041-performance-result.json.)
pause
exit /b %STCR_RESULT%
