@echo off
setlocal
chcp 65001 >nul
rem 仅由人类双击。只删已确认指向本项目的联接，不递归、不遍历内容。
node -e "const fs=require('node:fs'),path=require('node:path');const link='F:\\Claude\\xinllm\\SillyTavern\\data\\default-user\\extensions\\st-reader';try{let item;try{item=fs.lstatSync(link)}catch(e){if(e.code!=='ENOENT')throw e}if(!item){console.log('联接不存在，无需卸载。')}else if(!item.isSymbolicLink()){throw new Error('目标不是联接，已停止；不会删除普通文件夹。')}else if(path.resolve(fs.readlinkSync(link)).toLowerCase()!==path.resolve('E:\\st-reader\\extension').toLowerCase()){throw new Error('联接指向其他位置，已停止。')}else{fs.unlinkSync(link);console.log('已移除联接。E 盘扩展文件及聊天均保留，请重新启动 ST。')}}catch(e){console.error('未能移除联接：'+e.message);process.exitCode=1}"
set "STCR_RESULT=%ERRORLEVEL%"
echo.
pause
exit /b %STCR_RESULT%
