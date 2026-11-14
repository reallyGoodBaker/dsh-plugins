#!/usr/bin/env node
// dsh-mcdev 文档检索自测：`node scripts/test-docs-search.mjs`
//
// 覆盖：search（英文 token / 中文 2-gram / 英文短语）、read 分片、路径穿越拒绝、
// list 前缀过滤、stats 统计；并打印构建统计与搜索耗时。失败时退出码 1。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createDocs } from '../lib/docs/index.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(HERE, '..');
const DOCS_DIR = path.join(PLUGIN_ROOT, 'docs');

let failures = 0;
let checks = 0;

function ok(message) {
  checks += 1;
  console.log(`  ✔ ${message}`);
}

function fail(message, err) {
  checks += 1;
  failures += 1;
  console.log(`  ✘ ${message}${err ? ` — ${err.message || err}` : ''}`);
}

function check(label, fn) {
  try {
    const value = fn();
    ok(label);
    return value;
  } catch (err) {
    fail(label, err);
    return undefined;
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function formatBytes(n) {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MB`;
  return `${(n / 1024).toFixed(1)} KB`;
}

console.log('== dsh-mcdev 文档检索自测 ==');
console.log(`docs 目录: ${DOCS_DIR}`);

const indexPath = path.join(DOCS_DIR, 'index.json');
if (!fs.existsSync(indexPath)) {
  console.error(`✘ 缺少 docs/index.json，请先运行: node scripts/build-docs-index.mjs`);
  process.exit(1);
}

const docs = createDocs({ dir: DOCS_DIR });

// ---------- stats ----------
console.log('\n[1] 索引/语料统计');
const stats = check('stats() 可读取索引统计', () => docs.stats());
if (stats) {
  console.log(
    `    files=${stats.files} totalChars=${stats.totalChars} corpus=${formatBytes(stats.totalBytes)} index=${formatBytes(stats.indexBytes)} builtAt=${stats.builtAt}`,
  );
  console.log(`    sources=${stats.sources.map((s) => `${s.name}:${s.files}`).join(', ')}`);
  check('文件数 >= 600', () => assert(stats.files >= 600, `files=${stats.files}`));
  check('索引体积 > 100KB', () => assert(stats.indexBytes > 100 * 1024, `indexBytes=${stats.indexBytes}`));
}

// ---------- search ----------
const queries = ['execute_code', '实体伤害', 'json ui'];
const searchReport = [];

for (const query of queries) {
  console.log(`\n[search] query=${JSON.stringify(query)}`);
  const t0 = performance.now();
  const hits = check(`search(${JSON.stringify(query)}) 有结果`, () => {
    const out = docs.search(query, 10);
    assert(Array.isArray(out), '返回值不是数组');
    assert(out.length > 0, '没有命中');
    return out;
  });
  const elapsed = performance.now() - t0;
  if (!hits) continue;

  check(`search(${JSON.stringify(query)}) 结果字段完整`, () => {
    for (const hit of hits) {
      assert(typeof hit.path === 'string' && hit.path.length > 0, 'path 缺失');
      assert(typeof hit.title === 'string' && hit.title.length > 0, 'title 缺失');
      assert(typeof hit.snippet === 'string', 'snippet 缺失');
      assert(hit.snippet.length <= 200, `snippet 超 200 字符: ${hit.snippet.length}`);
      assert(typeof hit.score === 'number' && Number.isFinite(hit.score), 'score 非法');
    }
  });
  check(`search(${JSON.stringify(query)}) 返回条数 <= limit`, () => assert(hits.length <= 10, `hits=${hits.length}`));

  console.log(`    耗时 ${elapsed.toFixed(1)} ms，前 3 条：`);
  for (const hit of hits.slice(0, 3)) {
    console.log(`    - [${hit.score}] ${hit.path} — ${hit.title}`);
    console.log(`      ${hit.snippet.replace(/\s+/g, ' ').slice(0, 120)}`);
  }
  searchReport.push({ query, elapsed, hits: hits.slice(0, 3).map((h) => ({ path: h.path, score: h.score })) });
}

check('空查询返回空数组', () => {
  const out = docs.search('', 5);
  assert(Array.isArray(out) && out.length === 0, `out=${JSON.stringify(out)}`);
});

// ---------- read ----------
console.log('\n[2] read 分片');
const firstDoc = check('list() 至少返回一篇文档', () => {
  const all = docs.list();
  assert(all.length > 0, 'list() 为空');
  return all[0];
});

if (firstDoc) {
  const full = check(`read(${firstDoc.path}) 首篇可读`, () => {
    const out = docs.read(firstDoc.path, 0, 400);
    assert(out.path === firstDoc.path, 'path 不一致');
    assert(typeof out.title === 'string' && out.title.length > 0, 'title 缺失');
    assert(typeof out.text === 'string' && out.text.length > 0, 'text 为空');
    assert(out.offset === 0, `offset=${out.offset}`);
    assert(out.text.length <= 400, `text 超 maxChars: ${out.text.length}`);
    assert(typeof out.total === 'number' && out.total > 0, 'total 非法');
    assert(out.more === out.total > out.text.length, 'more 语义不一致');
    return out;
  });
  if (full) console.log(`    首篇: ${full.path}（title=${full.title}，total=${full.total}，more=${full.more}）`);

  check('read 第二片 offset 生效', () => {
    const out = docs.read(firstDoc.path, 100, 50);
    assert(out.offset === 100, `offset=${out.offset}`);
    assert(out.text.length <= 50, `text 超 maxChars: ${out.text.length}`);
    assert(out.more === 100 + out.text.length < out.total, 'more 语义不一致');
  });

  check('read 默认 maxChars=6000', () => {
    const out = docs.read(firstDoc.path);
    assert(out.text.length <= 6000, `text=${out.text.length}`);
  });
}

// ---------- list ----------
console.log('\n[3] list 前缀过滤');
check('list("ModAPI/接口") 命中且路径正确', () => {
  const out = docs.list('ModAPI/接口');
  assert(out.length > 0, '结果为空');
  assert(out.every((d) => d.path.startsWith('ModAPI/接口')), '出现前缀外路径');
});
check('list("NeteaseGuide") 命中', () => assert(docs.list('NeteaseGuide').length > 0, '结果为空'));
check('list("no-such-source") 为空', () => assert(docs.list('no-such-source').length === 0, '应为空'));

// ---------- 路径安全 ----------
console.log('\n[4] 路径穿越 / 越界拒绝');
const badPaths = [
  '../index.json',
  'ModAPI/../../CONTRACT.md',
  'C:\\Windows\\win.ini',
  '/etc/passwd',
  '\\\\server\\share\\x.md',
  '..\\..\\package.json',
  'ModAPI/../../../README.md',
  '',
];
for (const badPath of badPaths) {
  check(`read(${JSON.stringify(badPath)}) 被拒绝`, () => {
    let threw = false;
    try {
      docs.read(badPath);
    } catch (err) {
      threw = true;
      assert(/非法|不存在|不能为空/.test(err.message), `错误信息不清晰: ${err.message}`);
    }
    assert(threw, '没有抛出错误');
  });
}

// ---------- 汇总 ----------
console.log('\n== 汇总 ==');
console.log(`  检查项 ${checks} 个，失败 ${failures} 个`);
for (const r of searchReport) {
  console.log(`  search(${JSON.stringify(r.query)}) ${r.elapsed.toFixed(1)} ms -> ${r.hits.map((h) => h.path).join(' | ')}`);
}
if (failures > 0) {
  console.error(`\n✘ 自测失败：${failures} 项`);
  process.exit(1);
}
console.log('\n✔ 全部通过');
