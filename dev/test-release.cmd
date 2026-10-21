@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0.."
node "%~dp0selftest.mjs"
if errorlevel 1 goto failed
node "%~dp0..\src\ui\ui.test.js"
if errorlevel 1 goto failed
node "%~dp0test-performance.mjs" --chat-cache --backup --core-browser --ui-browser
if errorlevel 1 goto failed
node "%~dp0audit-readonly.mjs"
if errorlevel 1 goto failed
echo.
echo T57 OK.
pause
exit /b 0
:failed
echo.
echo T57 FAILED. Please keep the full error and .dev/fixtures/t57-performance-result.json.
pause
exit /b 1
