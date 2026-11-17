// 由代码生成 docs/卡片模板CSS指南.md（ui.test.js 核对两者一致）。用法：node dev/make-css-guide.mjs
import { writeFileSync } from 'node:fs';
import { buildCssGuide } from '../src/ui/cardCssGuide.js';

writeFileSync(new URL('../docs/卡片模板CSS指南.md', import.meta.url), buildCssGuide().replace(/\n/g, '\r\n'));
console.log('已生成 docs/卡片模板CSS指南.md');
