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
// T51：散文与网页混排，全部为新编的虚构场景；第一段故意不设 html/body 底色。
export const SCENE_HTML = `<style>
.paper-sky{max-width:680px;margin:12px auto;color:#315044;font:17px/1.8 serif}
.paper-sky header{padding:22px;background:#d8e6d9;border-radius:18px 18px 0 0}
.paper-sky h2{margin:0;font-size:27px}.paper-sky .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;padding:18px}
.paper-sky article{background:#e6eddf;border:1px solid #9bb6a2;border-radius:12px;padding:14px}
.paper-sky p{margin:8px 0}.paper-sky footer{padding:14px;border-top:1px dashed #7d9987;text-align:center}
</style>
<section class="paper-sky"><header><h2>纸月观测站 · 完全虚构</h2><p>今晚的星图由纸片与想象组成。</p></header>
<div class="cards">${['纸风车', '玻璃雨', '蓝色纸船', '月光信笺', '云朵标本', '微光种子'].map((name, i) => `<article><h3>观测 ${i + 1} · ${name}</h3><p>虚构观测员记录了一段温柔的天气。沿着窗边的细线，寻找下一枚纸星。</p><p>本页为合成样本，不包含真实人物或聊天。</p></article>`).join('\n')}</div>
<footer>观测完成，可以回到书页继续阅读。</footer></section>`;
export const MIXED_HTML = `『纸月观测站』\n${SCENE_HTML}\n合上虚构的观测簿，故事仍在书页上继续。`;
export const SECOND_SCENE_HTML = '<style>body{background:#e3ecf5;color:#24384d}.blue-post{padding:24px;border:2px dashed #7491ae}</style><section class="blue-post"><h2>第二站：虚构蓝邮局</h2><p>这一段有自己的 body 底色，透明默认值不能覆盖它。</p></section>';
export const MULTI_HTML = `『两座虚构站台』\n${SCENE_HTML}\n旅人走过一段散文，来到第二座站台。\n${SECOND_SCENE_HTML}\n两张网页已经结束，这句仍是正文。`;
// T72（I051、D35）：模仿社区卡的楼层结构（全部新编虚构）——散文 + 三个 details + 渐变胶囊样式盒 + 含 <style> 的状态栏 + <selection> + 小剧场 details。
const PILL = 'display:inline-block;padding:2px 12px;border-radius:999px;color:#fff;font-size:13px;background:linear-gradient(90deg,#f29bb8,#9bbcf2)';
export const COMMUNITY_BOX_HTML = `<div style="display:flex;flex-wrap:wrap;gap:8px;padding:10px 12px;border-radius:14px;background:linear-gradient(135deg,#fbe4ea,#e2ebfb)">
<span style="${PILL}">好感 72</span><span style="${PILL}">体力 45</span><span style="${PILL}">纸灯 × 1</span></div>
<style>
.harbor-status{margin-top:8px;padding:8px 12px;border:1px solid #d9c6a5;border-radius:10px;background:#fffaf0;color:#6b5435;font-size:13px}
.harbor-status b{color:#b0703a;margin-right:4px}
</style>
<div class="harbor-status"><b>时间</b>虚构历三年 · 夜　<b>地点</b>纸港口　<b>天气</b>薄雾</div>`;
export const COMMUNITY_HTML = `夜色压低了纸港口的灯。星灯把一只纸船推进水里，回头说：“三天后，灯塔见。”

测试旅人没有回答，只把船票折成一只更小的船，放在她的掌心。这一段是普通散文，应该按正文排版。

<details><summary>摘要</summary>
星灯与测试旅人在虚构的纸港口分别，约定三日后在灯塔重逢。
</details>
<details><summary>平行事件</summary>
雾岚在河的另一头捡到一封没有署名的信。
</details>
<details><summary>主线记录</summary>
第三章 · 纸港口（虚构）——分别。
</details>

${COMMUNITY_BOX_HTML}
<selection>选项：一、送别　二、留下　三、独自去灯塔</selection>

<details><summary>小剧场</summary>
纸船小声说：“其实我会游泳。”（虚构）
</details>`;
export const HTML_MESSAGES = [PHONE_HTML, `\`\`\`html\n${GAME_HTML}\n\`\`\``, MIXED_HTML, MULTI_HTML];
