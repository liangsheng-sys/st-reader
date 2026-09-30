// ST Reader — AGPL-3.0
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { changeJunction, LINK_PATH, SOURCE_PATH, LEGACY_SOURCE_PATH } from '../install/junction.mjs';
import { prepareDevJunction } from './junction.mjs';

const missing = () => Object.assign(new Error('不存在'), { code: 'ENOENT' });
function fixture({ exists = false, symbolic = true, target = SOURCE_PATH, linkError } = {}) {
    const calls = [];
    return { calls, fs: {
        lstatSync(path) { calls.push(['lstat', path]); if (!exists) throw missing(); return { isSymbolicLink: () => symbolic }; },
        symlinkSync(...args) { calls.push(['symlink', ...args]); if (linkError) throw linkError; },
        readlinkSync(path) { calls.push(['readlink', path]); return target; },
        unlinkSync(path) { calls.push(['unlink', path]); },
    } };
}

export function testInstall() {
    const results = [];
    const test = (name, run) => { run(); results.push({ name, passed: true }); };
    test('安装：内存替身只创建一个固定目标联接，不建父目录', () => {
        assert.equal(SOURCE_PATH, 'E:\\st-reader');
        const { fs, calls } = fixture();
        assert.match(changeJunction('link', fs), /已建立/);
        assert.deepEqual(calls, [['lstat', LINK_PATH], ['symlink', SOURCE_PATH, LINK_PATH, 'junction']]);
    });
    test('安装：普通目录、既有联接和悬空联接一律不覆盖', () => {
        for (const symbolic of [false, true]) {
            const { fs, calls } = fixture({ exists: true, symbolic });
            assert.throws(() => changeJunction('link', fs), /目标已存在/);
            assert.deepEqual(calls, [['lstat', LINK_PATH]]);
        }
    });
    test('安装：父目录缺失给出明确提示，不自动创建或尝试其他路径', () => {
        const { fs, calls } = fixture({ linkError: missing() });
        assert.throws(() => changeJunction('link', fs), /父目录已存在.*不会创建父目录/);
        assert.equal(calls.length, 2);
    });
    test('安装：检查后目标被其他程序创建仍停止，不覆盖', () => {
        const { fs, calls } = fixture({ linkError: Object.assign(new Error('已存在'), { code: 'EEXIST' }) });
        assert.throws(() => changeJunction('link', fs), /目标已存在/);
        assert.equal(calls.length, 2);
    });
    test('安装：检查目录项时权限不足立即停止', () => {
        let wrote = false;
        const denied = Object.assign(new Error('拒绝访问'), { code: 'EACCES' });
        assert.throws(() => changeJunction('link', { lstatSync() { throw denied; }, symlinkSync() { wrote = true; } }), error => error === denied);
        assert.equal(wrote, false);
    });
    test('卸载：只删指向本项目的联接，忽略 Windows 路径大小写', () => {
        const { fs, calls } = fixture({ exists: true, target: SOURCE_PATH.toLowerCase() });
        assert.match(changeJunction('unlink', fs), /已移除/);
        assert.deepEqual(calls, [['lstat', LINK_PATH], ['readlink', LINK_PATH], ['unlink', LINK_PATH]]);
    });
    test('卸载：联接不存在不做写入', () => {
        const { fs, calls } = fixture();
        assert.match(changeJunction('unlink', fs), /无需卸载/);
        assert.deepEqual(calls, [['lstat', LINK_PATH]]);
    });
    test('T40 卸载：旧联接即使已悬空也能移除，再安装只指向仓库根', () => {
        const old = fixture({ exists: true, target: LEGACY_SOURCE_PATH.toLowerCase() });
        assert.match(changeJunction('unlink', old.fs), /已移除/);
        assert.deepEqual(old.calls, [['lstat', LINK_PATH], ['readlink', LINK_PATH], ['unlink', LINK_PATH]]);
        const next = fixture();
        changeJunction('link', next.fs);
        assert.deepEqual(next.calls[1], ['symlink', 'E:\\st-reader', LINK_PATH, 'junction']);
    });
    test('T40 开发联接：缺失时创建，旧目标迁移，新目标复用', () => {
        const devLink = 'E:\\st-reader\\.dev\\data\\default-user\\extensions\\st-reader';
        for (const target of [null, LEGACY_SOURCE_PATH.toLowerCase(), SOURCE_PATH.toLowerCase()]) {
            const { fs, calls } = fixture({ exists: target !== null, target });
            prepareDevJunction(fs);
            const expected = [['lstat', devLink]];
            if (target) expected.push(['readlink', devLink]);
            if (target === LEGACY_SOURCE_PATH.toLowerCase()) expected.push(['unlink', devLink]);
            if (target !== SOURCE_PATH.toLowerCase()) expected.push(['symlink', SOURCE_PATH, devLink, 'junction']);
            assert.deepEqual(calls, expected);
        }
    });
    test('T40 开发联接：普通目录、未知目标与权限错误不做写入', () => {
        for (const options of [{ symbolic: false }, { target: 'E:\\unrelated' }, { target: SOURCE_PATH + '-other' }]) {
            const { fs, calls } = fixture({ exists: true, ...options });
            assert.throws(() => prepareDevJunction(fs), /未覆盖/);
            assert(!calls.some(([action]) => ['unlink', 'symlink'].includes(action)));
        }
        const denied = Object.assign(new Error('拒绝访问'), { code: 'EACCES' });
        assert.throws(() => prepareDevJunction({ lstatSync() { throw denied; } }), error => error === denied);
    });
    test('卸载：普通目录与指向其他位置的联接均拒绝删除', () => {
        for (const options of [{ symbolic: false }, { target: 'E:\\other-extension' }]) {
            const { fs, calls } = fixture({ exists: true, ...options });
            assert.throws(() => changeJunction('unlink', fs), /已停止/);
            assert(!calls.some(([action]) => action === 'unlink'));
        }
    });
    test('安装入口：参数错误不访问任何目录项', () => {
        assert.throws(() => changeJunction('other', {}), /操作必须/);
    });
    test('安装入口：批处理保持 ASCII 和 CRLF，使用相对脚本路径，不嵌套长 JS 命令', () => {
        for (const [name, action] of [['link-to-my-st', 'link'], ['unlink-from-my-st', 'unlink']]) {
            const bytes = readFileSync(new URL(`../install/${name}.cmd`, import.meta.url));
            assert(bytes.every(value => value < 128));
            const source = bytes.toString('ascii');
            assert(!/(?<!\r)\n/.test(source));
            assert(source.includes(`node.exe "%~dp0run-junction.mjs" ${action}\r\n`));
            assert(!source.includes('node -e'));
            assert(source.includes('[ST Reader] FAILED'));
        }
    });
    return results;
}
