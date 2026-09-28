import { testReadonlyGuard } from '../extension/src/core/readonlyGuard.test.js';
import { testFixtures } from './fixtures/selftest.mjs';
import { testCoreLogic } from '../extension/src/core/core.test.js';

// 后续任务把各模块的纯逻辑验证依次加入这里，不需要安装依赖。
try {
    const results = [...await testReadonlyGuard(), ...await testFixtures(), ...await testCoreLogic()];
    for (const result of results) console.log(`通过：${result.name}`);
    console.log(`\n全部通过（${results.length} 项）。测试没有发送任何网络请求。`);
} catch (error) {
    console.error('自测失败：', error);
    process.exitCode = 1;
}
