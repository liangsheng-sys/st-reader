// ST Reader — AGPL-3.0
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { prepareDevJunction } from './junction.mjs';

// 启动器只使用 Node 内置模块。固定位置避免误把真实实例当作开发实例。
const projectRoot = 'E:\\st-reader';
const sourceRoot = 'F:\\Claude\\xinllm\\SillyTavern';
const devRoot = path.join(projectRoot, '.dev');
const tempRoot = path.join(projectRoot, '.tmp');
const dataRoot = path.join(devRoot, 'data');
const configPath = path.join(devRoot, 'config.yaml');
const extensionRoot = projectRoot;
const junctionPath = path.join(dataRoot, 'default-user', 'extensions', 'st-reader');
const serverPath = path.join(sourceRoot, 'server.js');
let runtimeTemp;

function samePath(left, right) {
    return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
}

function statIfPresent(target) {
    try { return fs.lstatSync(target); } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
    }
}

// 逐级检查后再写入；拒绝 .dev、.tmp 或中间目录被重定向到仓库外。
function ensureLocalDirectory(target) {
    const relative = path.relative(projectRoot, target);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`目录越界：${target}`);
    let current = projectRoot;
    for (const part of relative.split(path.sep).filter(Boolean)) {
        current = path.join(current, part);
        const stat = statIfPresent(current);
        if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) {
            throw new Error(`需要普通目录，不能是文件或联接：${current}`);
        }
        if (!stat) fs.mkdirSync(current);
    }
}

function checkRegularFile(target) {
    const stat = statIfPresent(target);
    if (stat && (!stat.isFile() || stat.isSymbolicLink())) throw new Error(`需要普通文件：${target}`);
    if (stat?.nlink > 1) throw new Error(`拒绝写入多重硬链接文件：${target}`);
    return stat;
}

function checkConfig() {
    const contents = fs.readFileSync(configPath, 'utf8');
    // 只核对四个固定的顶层标量；其余 YAML 由 ST 自己解析与补全。
    const expected = { dataRoot, port: '8100', listen: 'false', whitelistMode: 'true' };
    for (const [key, value] of Object.entries(expected)) {
        const lines = contents.match(new RegExp(`^${key}:.*$`, 'gm')) ?? [];
        const actual = lines[0]?.slice(key.length + 1).trim().replace(/\s+#.*$/, '').replace(/^(['"])(.*)\1$/, '$2');
        if (lines.length !== 1 || actual !== value) {
            throw new Error(`.dev/config.yaml 的 ${key} 必须为 ${value}。请按 docs/SETUP_WINDOWS.md §2 恢复配置。`);
        }
    }
}

function prepareSettings() {
    const settingsPath = path.join(dataRoot, 'default-user', 'settings.json');
    const existed = checkRegularFile(settingsPath);
    // 仅使用程序自带默认设置；绝不从源实例的 data 目录复制设置。
    const settings = JSON.parse(fs.readFileSync(existed ? settingsPath : path.join(sourceRoot, 'default/content/settings.json'), 'utf8'));
    // 宿主默认选中 Horde 会在欢迎页请求远端模型列表；开发初始设置改用本地后端。
    const resetInitialApi = settings.firstRun && settings.main_api === 'koboldhorde';
    if (resetInitialApi) settings.main_api = 'kobold';
    if (!existed || resetInitialApi) {
        fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 4)}\n`);
        console.log('[st-reader] 开发初始设置已就绪，默认使用未连接的本地后端。');
    }
}

function prepare() {
    if (process.platform !== 'win32' || Number(process.versions.node.split('.')[0]) < 24) {
        throw new Error('此启动器需要 Windows 和 Node.js 24 或更新版本。');
    }
    const actualRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    if (!samePath(actualRoot, projectRoot) || !samePath(fs.realpathSync(projectRoot), projectRoot)) {
        throw new Error(`仓库必须位于普通目录 ${projectRoot}，不能通过其他目录联接启动。`);
    }
    if (!fs.existsSync(serverPath)) throw new Error(`找不到现有 ST 程序：${serverPath}`);
    const extensionStat = statIfPresent(extensionRoot);
    if (!extensionStat?.isDirectory() || extensionStat.isSymbolicLink()) throw new Error('仓库根必须是普通目录。');
    if (!fs.existsSync(path.join(extensionRoot, 'manifest.json'))) throw new Error('仓库根 manifest.json 缺失。');

    // ST 会补建这些程序目录；这里先检查，缺失时停止，防止在 F 盘创建目录。
    for (const relative of ['public/img', 'public/sounds', 'public/scripts/extensions']) {
        if (!fs.existsSync(path.join(sourceRoot, relative))) {
            throw new Error(`ST 程序目录 ${relative} 缺失。为避免写入 F 盘，启动已停止。`);
        }
    }
    // 旧版 ST 的迁移会搬走 public 下的数据。仅检查迁移触发目录是否存在，不读取内容。
    if (fs.existsSync(path.join(sourceRoot, 'public', 'characters'))) {
        throw new Error('检测到旧版 ST 数据迁移入口，为避免搬动源实例文件，启动已停止。');
    }

    ensureLocalDirectory(path.dirname(junctionPath));
    ensureLocalDirectory(path.join(devRoot, 'global-extensions'));
    ensureLocalDirectory(path.join(devRoot, 'program-backups'));
    ensureLocalDirectory(tempRoot);
    if (!checkRegularFile(configPath)) {
        fs.copyFileSync(path.join(projectRoot, 'dev', 'config.dev.yaml'), configPath, fs.constants.COPYFILE_EXCL);
        console.log('[st-reader] 已创建 .dev/config.yaml。');
    }
    checkConfig();

    console.log(`[st-reader] ${prepareDevJunction(fs)}`);
    prepareSettings();

    // 占位可阻止宿主尝试迁移 F 盘根目录的旧 access.log，不读、不搬旧日志。
    const accessLog = path.join(dataRoot, 'access.log');
    if (!checkRegularFile(accessLog)) fs.writeFileSync(accessLog, '', { flag: 'wx' });
    console.log(`[st-reader] 数据目录：${dataRoot}`);
    console.log(`[st-reader] 扩展联接：${junctionPath} -> ${extensionRoot}`);
}

async function checkPort() {
    await new Promise((resolve, reject) => {
        const probe = net.createServer();
        probe.once('error', error => reject(new Error(`8100 端口不可用（${error.code}）。请先关闭之前的开发实例窗口，再双击启动。`)));
        probe.listen({ port: 8100, host: '127.0.0.1', exclusive: true }, () => probe.close(resolve));
    });
}

function cleanRuntimeTemp() {
    if (!runtimeTemp) return;
    // 仅删除本次创建、已核对绝对路径的临时目录，不清理其他任务的文件。
    if (path.dirname(runtimeTemp) !== tempRoot || !path.basename(runtimeTemp).startsWith('stcr-runtime-')) {
        throw new Error('临时目录越界，拒绝清理。');
    }
    fs.rmSync(runtimeTemp, { recursive: true, force: true });
    runtimeTemp = undefined;
}

try {
    const args = process.argv.slice(2);
    if (args.some(arg => !['--prepare-only', '--no-pause'].includes(arg))) throw new Error('只支持 --prepare-only 或 --no-pause，不接受修改数据目录的参数。');
    if (!args.includes('--prepare-only')) await checkPort();
    prepare();
    if (!args.includes('--prepare-only')) {
        runtimeTemp = fs.mkdtempSync(path.join(tempRoot, 'stcr-runtime-'));
        console.log('[st-reader] 正在启动。首次编译可能需要几分钟；看到 listening 后打开 http://localhost:8100。');
        console.log('[st-reader] 保持本窗口打开；停止时按 Ctrl+C。');
        const child = spawn(process.execPath, [
            '--import', pathToFileURL(path.join(projectRoot, 'dev', 'isolate-dev-st.mjs')).href,
            serverPath, '--global', 'false', '--dataRoot', dataRoot, '--configPath', configPath,
            '--port', '8100', '--listen', 'false', '--whitelistMode', 'true', '--browserLaunchEnabled', 'false',
        ], {
            cwd: projectRoot, stdio: 'inherit',
            env: { ...process.env, TEMP: runtimeTemp, TMP: runtimeTemp, TMPDIR: runtimeTemp, NODE_COMPILE_CACHE: path.join(dataRoot, '_node-cache'), NODE_OPTIONS: '' },
        });
        // Windows 会把控制台 Ctrl+C 同时送给父子进程；等 ST 正常退出再清理。
        process.on('SIGINT', () => {});
        process.on('SIGTERM', () => child.kill('SIGTERM'));
        const exitCode = await new Promise((resolve, reject) => {
            child.once('error', reject);
            child.once('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
        });
        cleanRuntimeTemp();
        process.exitCode = exitCode;
    }
} catch (error) {
    console.error(`[st-reader] 启动失败：${error.message}`);
    cleanRuntimeTemp();
    process.exitCode = 1;
}
