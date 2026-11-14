// dsh-mcdev 离线文档检索模块。
//
// 用法：
//   import { createDocs } from './lib/docs/index.js';
//   const docs = createDocs({ dir: '<plugin>/docs' });   // dir 可省略，默认 <plugin>/docs
//   docs.search('实体伤害', 10)  // -> [{ path, title, snippet, score }]
//   docs.read('ModAPI/接口/通用/事件.md', 0, 6000) // -> { path, title, text, offset, total, more }
//   docs.list('ModAPI/接口')     // -> [{ path, source, title, chars }]
//   docs.stats()                 // -> 索引/语料统计
//
// 设计：
// - 一次性加载 docs/index.json（构建脚本 scripts/build-docs-index.mjs 生成），懒加载 + 进程内缓存。
// - 倒排：title 权重 8 > headings 4 > keywords 1.5；按 idf 加权；中文按 2-gram、英文按 token。
// - 候选文档再做正文校验/命中计数，用于精排与截取 snippet（≤200 字符）。
// - 索引里没有的查询词（罕见词）走一次全语料扫描兜底（结果有缓存）。
// - read/list 严格限制在 docs/corpus 内：拒绝绝对路径、`..` 穿越与 corpus 之外路径。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  countOccurrences,
  findFirstIndex,
  tokenizeQuery,
} from './tokenize.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DOCS_DIR = path.resolve(HERE, '..', '..', 'docs');
const DEFAULT_LIMIT = 10;
const DEFAULT_MAX_CHARS = 6000;
const MAX_SNIPPET = 200;
const SUPPORTED_INDEX_VERSION = 1;

const TITLE_WEIGHT = 8;
const HEADING_WEIGHT = 4;
const KEYWORD_WEIGHT = 1.5;

function clampInt(value, fallback, min, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

function stripMarkdownForSnippet(text) {
  return text
    .replace(/\r/g, '')
    .replace(/```[a-zA-Z0-9_-]*\n?/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^[ \t]*>.*$/gm, ' ') // 引用块整行（多为来源/元信息）
    .replace(/^[ \t]*#{1,6}[ \t]*/gm, '')
    .replace(/^[ \t]*[-*+][ \t]+/gm, ' ') // 列表符号
    .replace(/-{3,}/g, ' ') // 分隔线
    .replace(/[ \t]*\|[ \t]*/g, ' ')
    .replace(/[`*_~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 从正文截取命中上下文（≤200 字符）。 */
function makeSnippet(body, firstIndex) {
  const windowSize = 200;
  let start = firstIndex >= 0 ? Math.max(0, firstIndex - 70) : 0;
  let window = body.slice(start, start + windowSize);
  if (!window) return '';
  let snippet = stripMarkdownForSnippet(window);
  if (snippet.length > MAX_SNIPPET - 4) snippet = snippet.slice(0, MAX_SNIPPET - 4);
  if (start > 0) snippet = `…${snippet}`;
  if (start + windowSize < body.length) snippet = `${snippet}…`;
  return snippet.slice(0, MAX_SNIPPET);
}

function normalizeRelPath(input, label = 'path') {
  if (typeof input !== 'string' || input.trim() === '') {
    throw new Error(`${label} 不能为空`);
  }
  if (input.includes('\0')) throw new Error(`${label} 含非法字符`);
  const raw = input.trim().replaceAll('\\', '/');
  if (raw.startsWith('/') || /^[A-Za-z]:/.test(raw) || raw.startsWith('//') || raw.startsWith('~')) {
    throw new Error(`非法${label}（不允许绝对路径）: ${input}`);
  }
  const segments = raw.split('/').filter((seg) => seg !== '' && seg !== '.');
  if (segments.some((seg) => seg === '..')) {
    throw new Error(`非法${label}（不允许路径穿越 ..）: ${input}`);
  }
  if (segments.length === 0) throw new Error(`非法${label}: ${input}`);
  return segments.join('/');
}

/**
 * 创建文档检索器。
 * @param {{ dir?: string, corpusDir?: string, indexPath?: string }} [options]
 *   dir: 文档目录（含 index.json 与 corpus/），默认插件自带 docs 目录。
 */
export function createDocs(options = {}) {
  const docsDir =
    options.dir != null && String(options.dir).trim() !== ''
      ? path.resolve(String(options.dir))
      : DEFAULT_DOCS_DIR;
  const corpusDir = options.corpusDir ? path.resolve(String(options.corpusDir)) : path.join(docsDir, 'corpus');
  const indexPath = options.indexPath ? path.resolve(String(options.indexPath)) : path.join(docsDir, 'index.json');
  const corpusRoot = path.resolve(corpusDir);

  let state = null; // { index, docs, byPath, inverted, indexBytes }
  const bodyCache = new Map(); // relPath -> raw text
  const bodyScanCache = new Map(); // term -> Map<docIndex, count>（仅兜底扫描用）

  function load() {
    if (state) return state;
    if (!fs.existsSync(indexPath)) {
      throw new Error(
        `文档索引不存在: ${indexPath}；请先在插件目录运行 \`node scripts/build-docs-index.mjs\` 生成 docs/index.json`,
      );
    }
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    } catch (err) {
      throw new Error(`文档索引解析失败（${indexPath}）: ${err && err.message ? err.message : err}`);
    }
    if (!parsed || parsed.version !== SUPPORTED_INDEX_VERSION || !Array.isArray(parsed.docs)) {
      throw new Error(`文档索引格式不受支持（期望 version=${SUPPORTED_INDEX_VERSION}）: ${indexPath}`);
    }
    if (!fs.existsSync(corpusRoot) || !fs.statSync(corpusRoot).isDirectory()) {
      throw new Error(`文档语料目录不存在: ${corpusRoot}`);
    }

    const docs = parsed.docs;
    const byPath = new Map();
    const inverted = new Map(); // term -> Map<docIndex, weight>

    const addTerm = (term, docIndex, weight) => {
      if (!term) return;
      let postings = inverted.get(term);
      if (!postings) {
        postings = new Map();
        inverted.set(term, postings);
      }
      if (!postings.has(docIndex)) postings.set(docIndex, weight);
    };

    docs.forEach((doc, docIndex) => {
      if (!doc || typeof doc.path !== 'string') return;
      byPath.set(doc.path, doc);
      for (const term of tokenizeQuery(doc.title || '')) addTerm(term.term, docIndex, TITLE_WEIGHT);
      for (const heading of doc.headings || []) {
        for (const term of tokenizeQuery(heading)) addTerm(term.term, docIndex, HEADING_WEIGHT);
      }
      for (const keyword of doc.keywords || []) addTerm(keyword, docIndex, KEYWORD_WEIGHT);
    });

    let indexBytes = 0;
    try {
      indexBytes = fs.statSync(indexPath).size;
    } catch {
      indexBytes = 0;
    }
    state = { index: parsed, docs, byPath, inverted, indexBytes };
    return state;
  }

  function readCorpusFile(relPath) {
    const abs = path.resolve(corpusRoot, relPath);
    const rel = path.relative(corpusRoot, abs);
    if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error(`非法文档路径（必须在 docs/corpus 内）: ${relPath}`);
    }
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      throw new Error(`文档不存在: ${relPath}`);
    }
    return { abs, text: fs.readFileSync(abs, 'utf8') };
  }

  function bodyOf(relPath) {
    const cached = bodyCache.get(relPath);
    if (cached !== undefined) return cached;
    const { text } = readCorpusFile(relPath);
    bodyCache.set(relPath, text);
    return text;
  }

  function titleOf(doc, relPath) {
    if (doc && doc.title) return doc.title;
    return path.basename(relPath, path.extname(relPath));
  }

  /** 全语料扫描缺失词（索引里没有的查询词），返回 Map<docIndex, 匹配得分>。 */
  function scanForMissingTerms(st, missingTerms) {
    const key = missingTerms.map((t) => t.term).sort().join('\u0000');
    const cached = bodyScanCache.get(key);
    if (cached) return cached;

    const found = new Map();
    st.docs.forEach((doc, docIndex) => {
      let text;
      try {
        text = bodyOf(doc.path);
      } catch {
        return;
      }
      let score = 0;
      for (const term of missingTerms) {
        const hits = countOccurrences(text, term.term, term.kind);
        if (hits > 0) score += term.weight * (1 + Math.log(1 + hits)) * 2;
      }
      if (score > 0) found.set(docIndex, score);
    });
    bodyScanCache.set(key, found);
    return found;
  }

  /** 检索文档，返回 [{ path, title, snippet, score }]，按得分降序。 */
  function search(query, limit = DEFAULT_LIMIT) {
    const st = load();
    const maxResults = clampInt(limit, DEFAULT_LIMIT, 1, 50);
    const terms = tokenizeQuery(query);
    if (terms.length === 0) return [];

    const N = st.docs.length;
    const scores = new Map(); // docIndex -> metadata score
    const missing = [];

    for (const term of terms) {
      const postings = st.inverted.get(term.term);
      if (!postings || postings.size === 0) {
        // `execute_code` 这类复合词：若拆出的子词（execute/code）都已在索引里，
        // 无需为整词再做全语料扫描，避免每次搜索多花几百毫秒。
        const parts = term.kind === 'ascii' && term.term.includes('_')
          ? term.term.split('_').filter((p) => p.length >= 2)
          : [];
        if (parts.length > 0 && parts.every((p) => st.inverted.has(p))) continue;
        missing.push(term);
        continue;
      }
      const idf = Math.log(1 + N / (1 + postings.size));
      for (const [docIndex, weight] of postings) {
        scores.set(docIndex, (scores.get(docIndex) || 0) + term.weight * weight * idf);
      }
    }

    // 索引里没有的罕见词：全语料扫描兜底（读文件缓存 + 结果缓存）
    if (missing.length > 0) {
      const extra = scanForMissingTerms(st, missing);
      for (const [docIndex, add] of extra) scores.set(docIndex, (scores.get(docIndex) || 0) + add);
    }
    if (scores.size === 0) return [];

    const lowerQuery = String(query ?? '').trim().toLowerCase();
    const candidateLimit = Math.max(maxResults * 8, 48);
    const candidates = [...scores.entries()]
      .sort((a, b) => b[1] - a[1] || a[0] - b[0])
      .slice(0, candidateLimit);

    const results = [];
    for (const [docIndex, metaScore] of candidates) {
      const doc = st.docs[docIndex];
      if (!doc) continue;
      let body;
      try {
        body = bodyOf(doc.path);
      } catch {
        continue;
      }

      let bodyScore = 0;
      let firstHit = -1;
      for (const term of terms) {
        const hits = countOccurrences(body, term.term, term.kind);
        if (hits === 0) continue;
        bodyScore += term.weight * Math.min(hits, 5);
        const idx = findFirstIndex(body, term.term, term.kind);
        if (idx >= 0 && (firstHit < 0 || idx < firstHit)) firstHit = idx;
      }

      // 标题/小标题整串命中的额外加成（如 "json ui"）
      let phraseBonus = 0;
      const titleLower = String(doc.title || '').toLowerCase();
      if (lowerQuery.length >= 3 && titleLower.includes(lowerQuery)) phraseBonus += 10;
      for (const heading of doc.headings || []) {
        if (lowerQuery.length >= 3 && String(heading).toLowerCase().includes(lowerQuery)) {
          phraseBonus += 4;
          break;
        }
      }

      if (firstHit < 0 && metaScore === 0 && phraseBonus === 0) continue;
      const score = metaScore + bodyScore + phraseBonus;
      if (!(score > 0)) continue;
      results.push({
        path: doc.path,
        title: titleOf(doc, doc.path),
        snippet: makeSnippet(body, firstHit),
        score: Math.round(score * 1000) / 1000,
      });
    }

    results.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
    return results.slice(0, maxResults);
  }

  /** 读取文档正文分片。 */
  function read(relPathInput, offset = 0, maxChars = DEFAULT_MAX_CHARS) {
    const st = load();
    const relPath = normalizeRelPath(relPathInput, '文档路径');
    const { text } = readCorpusFile(relPath);
    const total = text.length;
    const start = clampInt(offset, 0, 0, total);
    const size = clampInt(maxChars, DEFAULT_MAX_CHARS, 1, 200000);
    const chunk = text.slice(start, start + size);
    return {
      path: relPath,
      title: titleOf(st.byPath.get(relPath), relPath),
      text: chunk,
      offset: start,
      total,
      more: start + chunk.length < total,
    };
  }

  /** 列出语料中的文档（可按路径前缀过滤），按路径排序。 */
  function list(prefix = '') {
    const st = load();
    let normalized = '';
    if (typeof prefix === 'string' && prefix.trim() !== '') {
      normalized = normalizeRelPath(prefix, '路径前缀');
    }
    const items = [];
    for (const doc of st.docs) {
      if (normalized) {
        const match = doc.path === normalized || doc.path.startsWith(`${normalized}/`) || doc.path.startsWith(normalized);
        if (!match) continue;
      }
      items.push({ path: doc.path, source: doc.source, title: titleOf(doc, doc.path), chars: doc.chars });
    }
    items.sort((a, b) => a.path.localeCompare(b.path));
    return items;
  }

  /** 索引与语料统计。 */
  function stats() {
    const st = load();
    const s = st.index.stats || {};
    const sources = Object.entries(s.bySource || {})
      .map(([name, v]) => ({ name, files: v.files, chars: v.chars, bytes: v.bytes }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return {
      version: st.index.version,
      builtAt: st.index.builtAt,
      indexFile: indexPath,
      corpusDir: corpusRoot,
      indexBytes: st.indexBytes,
      files: st.docs.length,
      totalChars: s.totalChars || 0,
      totalBytes: s.totalBytes || 0,
      sources,
    };
  }

  return { search, read, list, stats };
}

export default createDocs;
