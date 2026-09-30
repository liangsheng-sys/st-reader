@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0.."
node "%~dp0selftest.mjs"
set "STCR_TEST_EXIT=%ERRORLEVEL%"
if not "%STCR_TEST_EXIT%"=="0" goto finished
node "%~dp0..\src\ui\ui.test.js"
set "STCR_TEST_EXIT=%ERRORLEVEL%"
:finished
echo.
if "%STCR_TEST_EXIT%"=="0" (echo [st-reader] 检查完成，请继续浏览器验收。) else (echo [st-reader] 检查失败，请把上方报错交给工程师。)
if /i not "%~1"=="--no-pause" pause
exit /b %STCR_TEST_EXIT%
