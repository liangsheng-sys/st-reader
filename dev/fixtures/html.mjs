// ST Reader — AGPL-3.0
// T44a 两楼全部虚构；.invalid 外链仅用于证明默认断网，不取自任何真实聊天。
export const PHONE_HTML = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://st-reader-fixture.invalid/fiction.css">
<style>
@font-face{font-family:FixtureRemote;src:url(https://st-reader-fixture.invalid/fiction.woff2)}
*{box-sizing:border-box}body{margin:0;padding:20px;background:#e9eee9;color:#203a32;font-family:FixtureRemote,Arial,sans-serif}
.phone{max-width:390px;margin:auto;border:8px solid #203a32;border-radius:28px;background:#f8faf5;overflow:hidden}
header{padding:20px;background:#203a32;color:white}.messages{padding:16px;max-height:370px;overflow:auto}
p{padding:12px;background:#e1eee6;border-radius:12px;line-height:1.6}.mine{margin-left:40px;background:#c8e6da}small{color:#57756a}
</style></head><body><article class="phone"><header>雾岛信箱 · 完全虚构</header><div class="messages">
<small>测试旅人与星灯的合成聊天</small><p class="mine">测试旅人：我想吃云朵饼、星砂糖、薄荷面、南瓜汤、海盐酥。</p>
<p>星灯：先把灯塔里的秘密地图收好，我们再去虚构集市。</p><p class="mine">测试旅人：你听见了吗？还有热可可。</p>
<p>星灯：听见了。这张清单够纸舟装满一整页。</p><p class="mine">测试旅人：那就约在虚构钟楼，带上蓝色信封。</p>
<p>星灯：好的，故事里的点心永远不会售罄。</p></div></article></body></html>`;

export const GAME_HTML = `<!doctype html><html lang="zh-CN"><head><style>
*{box-sizing:border-box}body{margin:0;padding:24px;background:#1c2529;color:#f0deaf;font:18px/1.7 monospace}
main{max-width:900px;margin:auto;border:2px solid #d4ba75;padding:22px}h1{font-size:26px}button{font:inherit;padding:12px;margin:6px;background:#e4cf98;color:#19272b;border:0;cursor:pointer}
#ending{min-height:100px;border-top:1px dashed #d4ba75;margin-top:20px;padding-top:14px}.grid{display:grid;grid-template-columns:2fr 1fr;gap:20px}@media(max-width:600px){.grid{grid-template-columns:1fr}}
</style></head><body><main><h1>雾钟站：虚构网页游戏</h1><div class="grid"><section>
<p>测试旅人抵达废弃的灯塔。引路人星灯交给你一张秘密地图。</p><p>纸影从钟面落下。请选择一件物品，改变这段虚构故事的结局。</p>
<button id="lantern">举起纸灯</button><button id="bell">摇响铜铃</button><p id="ending">尚未选择。所有人物、地点与事件均为合成样本。</p>
</section><aside>物品栏<br>纸灯 × 1<br>铜铃 × 1<br>空白日记 × 1</aside></div></main>
<script>document.getElementById('lantern').onclick=()=>{document.getElementById('ending').textContent='纸影变成了飞鸟：星灯与你沿着晨光回家。';};document.getElementById('bell').onclick=()=>{document.getElementById('ending').textContent='钟声唤醒了纸舟：测试旅人写下一个新的开头。';};</script></body></html>`;
export const HTML_MESSAGES = [PHONE_HTML, `\`\`\`html\n${GAME_HTML}\n\`\`\``];
