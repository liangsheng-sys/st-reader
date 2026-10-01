// ST Reader — AGPL-3.0
import { htmlResourceUrl } from './htmlExternalResources.js';
import { buildSrcdoc } from './htmlRenderer.js';
const assert = (condition, message) => { if (!condition) throw new Error(message); };
export function testHtmlSnapshotLogic() {
    const results = [], test = (name, run) => { run(); results.push({ name: `I032 ${name}`, passed: true }); };
    test('相对 CSS/图片资源按所属样式表地址解析，允许用户 HTTPS/HTTP 资源', () => {
        assert(htmlResourceUrl('../font.woff2', 'https://fixture.invalid/css/main.css') === 'https://fixture.invalid/font.woff2', 'CSS 相对地址错误');
        assert(htmlResourceUrl('http://localhost:8100/image.png', 'https://fixture.invalid/') === 'http://localhost:8100/image.png', '用户资源被无故禁网');
    });
    test('资源读取拒绝脚本协议、内嵌凭据及编码后的禁写聊天接口', () => {
        for (const raw of ['javascript:alert(1)', 'file:///secret', 'https://name:password@fixture.invalid/a', '/api/chats/save', '/api/chats/%73ave', '/api/chats/group/delete']) {
            let failed = false; try { htmlResourceUrl(raw, 'https://fixture.invalid/'); } catch { failed = true; } assert(failed, '非法资源未拒绝');
        }
    });
    test('快照脚本留在两层不透明源内，用户 HTML 不能逃出宿主外壳', () => {
        const source = buildSrcdoc('<body></script><script>bad()</script></body>');
        assert(source.includes('stcr:html-snapshot-request') && source.includes('stcr:html-snapshot-result'), '未注入快照通道');
        assert(!source.includes('allow-same-origin') && (source.match(/<script>/g) ?? []).length === 1, '降低了隔离边界');
    });
    return results;
}
