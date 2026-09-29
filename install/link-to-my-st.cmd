@echo off
setlocal
chcp 65001 >nul
rem 仅由人类双击。只检查这个目录项；绝不枚举真实数据或创建父目录。
node -e "const fs=require('node:fs');const link='F:\\Claude\\xinllm\\SillyTavern\\data\\default-user\\extensions\\st-reader';try{let item;try{item=fs.lstatSync(link)}catch(e){if(e.code!=='ENOENT')throw e}if(item){console.error('目标已存在，未覆盖、未删除：'+link);process.exitCode=1}else{fs.symlinkSync('E:\\st-reader\\extension',link,'junction');console.log('目录联接已建立。请启动 ST，在扩展面板查看 阅读器 (ST Reader)。')}}catch(e){console.error('未能建立联接：'+e.message);process.exitCode=1}"
set "STCR_RESULT=%ERRORLEVEL%"
echo.
pause
exit /b %STCR_RESULT%
