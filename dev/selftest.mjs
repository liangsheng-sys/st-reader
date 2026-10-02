// ST Reader — AGPL-3.0
import { testReadonlyGuard } from '../src/core/readonlyGuard.test.js';
import { testFixtures } from './fixtures/selftest.mjs';
import { testCoreLogic } from '../src/core/core.test.js';
import { testPersistenceLogic } from '../src/core/persistence.test.js';
import { testCardExportLogic } from '../src/core/cardExport.test.js';
import { testInstall } from './install.test.mjs';
import { testCoreFixesLogic } from '../src/core/coreFixes.test.js';
import { testHtmlRendererLogic } from '../src/core/htmlRenderer.test.js';
import { testHtmlSnapshotLogic } from '../src/core/htmlSnapshot.test.js';
import { testChatCacheLogic } from '../src/core/chatCache.test.js';
import { testUpdateServiceLogic } from '../src/core/updateService.test.js';

// 后续任务把各模块的纯逻辑验证依次加入这里，不需要安装依赖。
try {
    const results = [...await testReadonlyGuard(), ...await testFixtures(), ...await testCoreLogic(), ...await testPersistenceLogic(), ...await testCardExportLogic(), ...testInstall(), ...await testCoreFixesLogic(), ...testHtmlRendererLogic(), ...testHtmlSnapshotLogic(), ...await testUpdateServiceLogic(), ...await testChatCacheLogic()];
    for (const result of results) console.log(`通过：${result.name}`);
    console.log(`\n全部通过（${results.length} 项）。测试没有发送任何网络请求。`);
} catch (error) {
    console.error('自测失败：', error);
    process.exitCode = 1;
}
