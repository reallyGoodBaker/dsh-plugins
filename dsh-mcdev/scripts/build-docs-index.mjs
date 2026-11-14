#!/usr/bin/env node
// 构建 dsh-mcdev 离线文档索引：遍历 docs/corpus，生成 docs/index.json。
//
// 用法：
//   node scripts/build-docs-index.mjs                # 默认 docs/corpus -> docs/index.json
//   node scripts/build-docs-index.mjs --corpus <dir> --out <file>
//   node scripts/build-docs-index.mjs --quiet        # 只输出一行结果
//
// 索引结构（version 1）：
//   { version: 1, builtAt: ISO, stats: {...},
//     docs: [{ path, source, title, headings, chars, keywords }] }
//   - path   相对 docs/corpus 的 POSIX 路径
//   - source 第一层目录名（ModAPI/NeteaseGuide/QuModDocs/BedrockDev/ShaderSDK/SAPI/BedrockWiki）
//   - title  首个 H1，否则文件名（去扩展名）
//   - headings H1..H6 文本（去重、去 HTML、最多 60 个）
//   - chars  正文字符数
//   - keywords 标题/小标题词 + 正文高频中文 2-gram + 英文 token（去停用词，最多 200 个）
//
// 可重复执行：每次完整重建；写 tmp 后 rename，避免半截文件。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { countAsciiTokens, countZhGrams } from '../lib/docs/tokenize.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(HERE, '..');
const DEFAULT_CORPUS = path.join(PLUGIN_ROOT, 'docs', 'corpus');
const DEFAULT_OUT = path.join(PLUGIN_ROOT, 'docs', 'index.json');

const INDEX_VERSION = 1;
const DOC_EXTENSIONS = new Set(['.md', '.ts']);
const MAX_HEADINGS = 60;
const MAX_KEYWORDS = 200;
const MAX_ASCII = 120;
const MAX_GRAMS = 80;

// ---------- 参数 ----------

function parseArgs(argv) {
  const opts = { corpus: DEFAULT_CORPUS, out: DEFAULT_OUT, quiet: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--corpus') opts.corpus = path.resolve(argv[++i]);
    else if (arg === '--out') opts.out = path.resolve(argv[++i]);
    else if (arg === '--quiet') opts.quiet = true;
    else if (arg === '--help' || arg === '-h') {
      console.log('用法: node scripts/build-docs-index.mjs [--corpus <dir>] [--out <file>] [--quiet]');
      process.exit(0);
    } else {
      throw new Error(`未知参数: ${arg}`);
    }
  }
  return opts;
}

// ---------- 文件遍历 ----------

function walkCorpus(corpusDir) {
  const files = [];
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile() && DOC_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        files.push(full);
      }
    }
  };
  visit(corpusDir);
  return files;
}

// ---------- 文本抽取 ----------

function stripInlineMarkdown(s) {
  return s
    .replace(/<[^>]*>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*_~]+/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  return m ? text.slice(m[0].length) : text;
}

/** 抽取标题与 H1..H6（跳过代码块内的 # 注释）。 */
function extractTitleAndHeadings(rawText, filePath) {
  const text = splitFrontmatter(rawText);
  const headings = [];
  const seen = new Set();
  let title = '';
  let inFence = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (/^(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!m) continue;
    const clean = stripInlineMarkdown(m[2]);
    if (!clean) continue;
    if (!title && m[1].length === 1) title = clean;
    if (!seen.has(clean)) {
      seen.add(clean);
      if (headings.length < MAX_HEADINGS) headings.push(clean);
    }
  }
  if (!title) {
    const base = path.basename(filePath);
    const ext = path.extname(base);
    let name = base.slice(0, base.length - ext.length);
    if (name.endsWith('.d')) name = name.slice(0, -2); // server.d.ts -> server
    title = name || base;
  }
  return { title, headings };
}

// ---------- 词法抽取 ----------

/** 关键词 = 标题/小标题/文件名词优先 + 正文高频词；英文 token 与中文 2-gram 分开限额。 */
function extractKeywords(title, headings, body, filePath) {
  const ascii = new Map();
  const grams = new Map();
  countAsciiTokens(body, ascii);
  countZhGrams(body, grams);

  const rawName = path.basename(filePath, path.extname(filePath));
  const fileName = rawName.endsWith('.d') ? rawName.slice(0, -2) : rawName;
  const metaText = `${title} ${fileName} ${headings.join(' ')}`;
  const metaAscii = new Map();
  const metaGrams = new Map();
  countAsciiTokens(metaText, metaAscii);
  countZhGrams(metaText, metaGrams);

  const ordered = [];
  // 标题/小标题/文件名词优先（提升召回与排序信号）
  let asciiCount = 0;
  let gramCount = 0;
  for (const term of metaAscii.keys()) {
    if (asciiCount >= MAX_ASCII) break;
    if (ordered.includes(term)) continue;
    ordered.push(term);
    asciiCount += 1;
  }
  for (const term of metaGrams.keys()) {
    if (gramCount >= MAX_GRAMS) break;
    if (ordered.includes(term)) continue;
    ordered.push(term);
    gramCount += 1;
  }

  const byFreq = (map) =>
    [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  for (const [term] of byFreq(ascii)) {
    if (asciiCount >= MAX_ASCII) break;
    if (ordered.includes(term)) continue;
    ordered.push(term);
    asciiCount += 1;
  }
  for (const [term] of byFreq(grams)) {
    if (gramCount >= MAX_GRAMS) break;
    if (ordered.includes(term)) continue;
    ordered.push(term);
    gramCount += 1;
  }

  // 类别限额已在填充时保证，这里只做最终截断
  return ordered.slice(0, MAX_KEYWORDS);
}

// ---------- 主流程 ----------

function sourceOf(relPath) {
  const first = relPath.split('/')[0];
  return first || 'unknown';
}

function buildIndex(corpusDir) {
  if (!fs.existsSync(corpusDir) || !fs.statSync(corpusDir).isDirectory()) {
    throw new Error(`语料目录不存在: ${corpusDir}`);
  }
  const startedAt = Date.now();
  const files = walkCorpus(corpusDir).sort((a, b) => a.localeCompare(b));

  const docs = [];
  const stats = { files: 0, totalChars: 0, totalBytes: 0, bySource: {} };
  for (const file of files) {
    const buf = fs.readFileSync(file);
    const rawText = buf.toString('utf8');
    const relPath = path.relative(corpusDir, file).replaceAll('\\', '/');
    const source = sourceOf(relPath);
    const { title, headings } = extractTitleAndHeadings(rawText, file);
    const bodyText = stripInlineMarkdown(
      // 引用行（> ...）多为索引/来源等元信息（如 BedrockWiki 摘要头），不计入关键词
      splitFrontmatter(rawText).replace(/^\s*>.*$/gm, ' '),
    );
    const keywords = extractKeywords(title, headings, bodyText, file);

    docs.push({
      path: relPath,
      source,
      title,
      headings,
      chars: rawText.length,
      keywords,
    });

    const bucket = (stats.bySource[source] ||= { files: 0, chars: 0, bytes: 0 });
    bucket.files += 1;
    bucket.chars += rawText.length;
    bucket.bytes += buf.length;
    stats.files += 1;
    stats.totalChars += rawText.length;
    stats.totalBytes += buf.length;
  }

  docs.sort((a, b) => a.path.localeCompare(b.path));
  return {
    index: {
      version: INDEX_VERSION,
      builtAt: new Date().toISOString(),
      stats,
      docs,
    },
    elapsedMs: Date.now() - startedAt,
  };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const { index, elapsedMs } = buildIndex(opts.corpus);
  const json = JSON.stringify(index);
  const outTmp = `${opts.out}.tmp`;
  fs.mkdirSync(path.dirname(opts.out), { recursive: true });
  fs.writeFileSync(outTmp, json, 'utf8');
  fs.renameSync(outTmp, opts.out);

  const indexBytes = Buffer.byteLength(json, 'utf8');
  const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`;
  if (!opts.quiet) {
    console.log(`docs/index.json 构建完成`);
    console.log(`  语料目录  ${opts.corpus}`);
    console.log(`  输出文件  ${opts.out}`);
    console.log(`  文件数    ${index.stats.files}`);
    console.log(`  语料体积  ${mb(index.stats.totalBytes)}（${index.stats.totalBytes} 字节）`);
    console.log(`  正文字符  ${index.stats.totalChars}`);
    console.log(`  索引体积  ${mb(indexBytes)}（${indexBytes} 字节）`);
    for (const [source, s] of Object.entries(index.stats.bySource).sort()) {
      console.log(`    ${source.padEnd(14)} ${String(s.files).padStart(4)} 文件  ${mb(s.bytes).padStart(9)}`);
    }
    console.log(`  耗时      ${elapsedMs} ms`);
  } else {
    console.log(
      `built docs/index.json: files=${index.stats.files} corpusBytes=${index.stats.totalBytes} indexBytes=${indexBytes} ms=${elapsedMs}`,
    );
  }
}

main();
