// ST Reader — AGPL-3.0
/**
 * 默认断网时先去掉声明式外链，避免被 CSP 拦截的 URL 仍进入 Resource Timing。
 * 此函数还会整体序列化进可信外壳，故所有依赖必须在函数内部，不引用宿主变量。
 */
export function removeNetworkResources(doc) {
    function localValue(value) {
        if (/\\|image-set\s*\(|@import/i.test(value)) return false;
        return [...value.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi)]
            .every(match => /^(?:data:|blob:|#)/i.test((match[1] ?? match[2] ?? match[3]).trim()));
    }
    function declarations(style) {
        return [...style].filter(key => localValue(style.getPropertyValue(key)))
            .map(key => `${key}:${style.getPropertyValue(key)}${style.getPropertyPriority(key) ? '!important' : ''};`).join('');
    }
    function css(text) {
        const sheet = new CSSStyleSheet(); sheet.replaceSync(text);
        function rules(list) {
            return [...list].map(rule => {
                if (rule.type === 3) return '';
                if (rule.type === 5) return rule.style.getPropertyValue('src') && localValue(rule.style.getPropertyValue('src')) ? `@font-face{${declarations(rule.style)}}` : '';
                if (rule.selectorText || rule.keyText) return `${rule.selectorText ?? rule.keyText}{${declarations(rule.style)}${rule.cssRules ? rules(rule.cssRules) : ''}}`;
                if (rule.constructor.name === 'CSSNestedDeclarations') return declarations(rule.style);
                if (rule.cssRules && /^@(media|supports|layer|container|scope|(?:-webkit-)?keyframes)\b/.test(rule.cssText)) return `${rule.cssText.slice(0, rule.cssText.indexOf('{'))}{${rules(rule.cssRules)}}`;
                return '';
            }).join('\n');
        }
        return rules(sheet.cssRules);
    }
    function visit(root) {
        for (const node of [...root.querySelectorAll('*')]) {
            const tag = node.localName.toLowerCase();
            if (['base', 'link', 'iframe', 'frame', 'object', 'embed'].includes(tag) || (tag === 'meta' && node.getAttribute('http-equiv')?.toLowerCase() === 'refresh')) { node.remove(); continue; }
            if (tag === 'script' && node.hasAttribute('src')) { node.remove(); continue; }
            for (const attribute of [...node.attributes]) {
                const name = attribute.name.toLowerCase(), value = attribute.value.trim();
                if (['srcset', 'ping', 'background'].includes(name)) node.removeAttributeNode(attribute);
                else if (['src', 'poster', 'xlink:href', 'href'].includes(name) && !['a', 'area'].includes(tag) && !/^(data:|blob:|#)/i.test(value)) node.removeAttributeNode(attribute);
                else if (name === 'style' && node.style) node.setAttribute('style', declarations(node.style));
            }
            if (tag === 'style') node.textContent = css(node.textContent);
            if (tag === 'template' && node.content) visit(node.content);
        }
    }
    visit(doc);
}
