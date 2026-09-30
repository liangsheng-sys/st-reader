@echo off
setlocal
echo [ST Reader] link v2026-09-30
chcp 65001 >nul
if not exist "%~dp0run-junction.mjs" goto missing_script
node.exe "%~dp0run-junction.mjs" link
set "STCR_RESULT=%ERRORLEVEL%"
if not "%STCR_RESULT%"=="0" echo [ST Reader] FAILED. Please copy ALL lines above and below this message.
goto finished
:missing_script
echo [ST Reader] FAILED: run-junction.mjs is missing beside this CMD file.
set "STCR_RESULT=1"
:finished
echo [ST Reader] Exit code: %STCR_RESULT%
echo.
pause
exit /b %STCR_RESULT%
