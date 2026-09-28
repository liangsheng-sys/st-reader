@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0.."
node dev\fixtures\install-ny-font.mjs
if errorlevel 1 goto finish
echo 安装完成。启动开发实例后，按 docs\SETUP_WINDOWS.md 的 T11 字体步骤导入。
:finish
pause
endlocal
