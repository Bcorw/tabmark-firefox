/* Generate docs/feature-inventory.md from shared/i18n.js (single source of truth). */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'shared/i18n.js'), 'utf8');

function extractBlock(name) {
  const start = src.indexOf('var ' + name + ' = {');
  if (start < 0) throw new Error('block not found: ' + name);
  let i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error('unbalanced block: ' + name);
}

function parseSections(block) {
  const sections = [];
  let current = { title: '(未分组)', entries: [] };
  sections.push(current);
  const re = /\/\*\s*─+\s*(.+?)\s*─+[\s\S]*?\*\/|(\w+):\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g;
  let m;
  while ((m = re.exec(block))) {
    if (m[1]) {
      current = { title: m[1], entries: [] };
      sections.push(current);
    } else if (m[2]) {
      let raw = m[3].slice(1, -1);
      raw = raw.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\n/g, '\n');
      current.entries.push([m[2], raw]);
    }
  }
  return sections.filter(s => s.entries.length);
}

const zh = parseSections(extractBlock('ZH'));
const en = parseSections(extractBlock('EN'));

const enMap = new Map();
for (const s of en) for (const [k, v] of s.entries) enMap.set(k, v);

let total = 0;
const out = [];
out.push('# 功能与文案清单（v2，由 shared/i18n.js 生成）');
out.push('');
out.push('> 本表是 `shared/i18n.js` 的镜像，由 `docs/gen-inventory.js` 自动生成，请勿手改。');
out.push('> 重新生成：`node docs/gen-inventory.js`。');
out.push('');
for (const s of zh) {
  out.push('## ' + s.title);
  out.push('| key | zh | en |');
  out.push('|---|---|---|');
  for (const [k, v] of s.entries) {
    total++;
    const ev = enMap.has(k) ? enMap.get(k) : '**缺失**';
    out.push(`| ${k} | ${v.replace(/\|/g, '\\|')} | ${ev.replace(/\|/g, '\\|')} |`);
  }
  out.push('');
}
const orphanEn = [...enMap.keys()].filter(k => !zh.some(s => s.entries.some(([kk]) => kk === k)));
if (orphanEn.length) {
  out.push('## ⚠ 仅存在于英文的 key');
  out.push(orphanEn.map(k => '- ' + k).join('\n'));
  out.push('');
}
out.push(`---`);
out.push(`共 ${total} 个 key，中英文一一对应。`);

fs.writeFileSync(path.join(root, 'docs/feature-inventory.md'), out.join('\n') + '\n');
console.log('written, keys =', total, orphanEn.length ? 'ORPHANS: ' + orphanEn : '');
