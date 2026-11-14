// 文档检索共用的分词/词表工具（构建索引与运行时搜索共用，避免两边词法漂移）。
//
// - 英文：`[A-Za-z_][A-Za-z0-9_]{1,}`，小写化，去停用词；2 字母 token 仅白名单保留。
// - 中文：对连续 CJK 片段切 2-gram，过滤功能字组合与高频噪声 gram。
// - 查询侧：英文整词权重 2.0，下划线拆分出的子词权重 1.0；中文 2-gram 权重 1.0，单字 0.8。

export const ASCII_TOKEN_RE = /[A-Za-z_][A-Za-z0-9_]{1,}/g;
export const CJK_RUN_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]+/g;

// 2 字母英文 token 只有白名单保留（其余多为 in/as/to/of 等噪声）
export const EN_SHORT_KEEP = new Set([
  'ui', 'js', 'ts', 'api', 'mc', 'pe', 'hp', 'xp', 'id', 'op', 'nbt', 'vr', 'ar', 'dx', 'gl', 'fx',
  'af', 'et', 'bp', 'rp', 'uv', 'px', 'ao', 'ai',
]);

export const EN_STOP = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'any', 'can', 'had', 'her', 'was', 'one',
  'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'its', 'new', 'now', 'old', 'see', 'two',
  'who', 'boy', 'did', 'she', 'use', 'may', 'way', 'too', 'say', 'man', 'add', 'put', 'try',
  'this', 'that', 'with', 'from', 'they', 'will', 'would', 'there', 'their', 'what', 'about', 'which',
  'when', 'make', 'like', 'time', 'just', 'know', 'take', 'into', 'your', 'some', 'could', 'them',
  'than', 'then', 'only', 'come', 'over', 'also', 'back', 'after', 'work', 'first', 'well', 'even',
  'want', 'because', 'these', 'give', 'most', 'should', 'must', 'need', 'does', 'here', 'each', 'very',
  'where', 'much', 'such', 'same', 'under', 'while', 'both', 'through', 'between', 'before',
  'being', 'having', 'used', 'using', 'true', 'false', 'null', 'none', 'yes', 'off', 'per', 'via',
  'etc', 'example', 'examples', 'note', 'notes', 'page', 'pages', 'see', 'set', 'has',
  'http', 'https', 'www', 'com', 'org', 'net', 'github', 'gitee', 'href', 'html', 'img', 'src', 'alt',
  'div', 'span', 'class', 'type', 'name', 'value', 'string', 'number', 'boolean', 'integer',
  'list', 'dict', 'tuple', 'object', 'function', 'method', 'self', 'def', 'return', 'import',
  'pass', 'nil', 'print', 'lambda', 'args', 'kwargs', 'bool', 'int', 'float', 'str',
  'json', 'md', 'markdown', 'title', 'description', 'category', 'tags', 'mentions', 'nav', 'order',
  'front', 'hard', 'time', 'min', 'mins', 'readonly', 'export', 'default', 'private', 'public',
  'protected', 'static', 'constructor', 'param', 'params', 'returns', 'throws', 'remarks', 'since',
  'beta', 'deprecated', 'void', 'let', 'const', 'var', 'async', 'await', 'then', 'catch',
  'as', 'in', 'of', 'is', 'an', 'be', 'if', 'on', 'at', 'by', 'or', 'no', 'do', 'so', 'up', 'we',
  'he', 'it', 'my', 'me', 'us', 'vs', 'to',
]);

// 中文功能字（两个字都在集合中时，该 2-gram 视为噪声）
export const ZH_STOP_CHARS = new Set(
  '的了是在和与及或也就都而及其这那有无不为以于等我你他她它们个些中上下之所能够可要需应该被把让从对到由向给用请更最很太又再还只已未将并且但若如因或吗呢吧啊呀么之'.split(''),
);

export const ZH_STOP_GRAMS = new Set([
  '我们', '你们', '他们', '这个', '那个', '可以', '如果', '因为', '所以', '但是', '进行', '通过',
  '需要', '时候', '之后', '之前', '其中', '对于', '相关', '问题', '注意', '这里', '那里', '就是',
  '没有', '不能', '不是', '这些', '那些', '什么', '如何', '或者', '然后', '并且', '已经', '可能',
  '自己', '其他', '由于', '目前', '一般', '提供', '包括', '支持', '以下', '如下', '一个', '一些',
  '这样', '那样', '以及', '上面', '下面', '部分', '内容', '参考', '详细', '具体', '说明', '文档',
  '示例', '比如', '例如', '还是', '只是', '不过', '而且', '然而', '因此', '从而', '另外', '此外',
  '同时', '之间', '为了', '无法', '不会', '是否', '可知', '即可', '建议', '情况', '方式', '方法',
  '效果', '功能', '参数', '返回', '默认', '设置', '获取', '创建', '修改', '删除',
]);

/** 是否接受某个英文 token（构建索引与查询共用）。 */
export function isUsefulAsciiToken(token) {
  if (token.length < 2) return false;
  if (token.length === 2 && !EN_SHORT_KEEP.has(token)) return false;
  if (EN_STOP.has(token)) return false;
  if (/^\d+$/.test(token)) return false;
  return true;
}

/** 中文 2-gram 是否保留。 */
export function isUsefulZhGram(a, b) {
  if (ZH_STOP_CHARS.has(a) && ZH_STOP_CHARS.has(b)) return false;
  return !ZH_STOP_GRAMS.has(a + b);
}

/** 统计英文 token 词频（term -> count）。 */
export function countAsciiTokens(text, out) {
  for (const m of text.matchAll(ASCII_TOKEN_RE)) {
    const token = m[0].toLowerCase();
    if (!isUsefulAsciiToken(token)) continue;
    out.set(token, (out.get(token) || 0) + 1);
  }
}

/** 统计中文 2-gram 词频（gram -> count）。 */
export function countZhGrams(text, out) {
  for (const m of text.matchAll(CJK_RUN_RE)) {
    const run = m[0];
    for (let i = 0; i + 1 < run.length; i += 1) {
      const a = run[i];
      const b = run[i + 1];
      if (!isUsefulZhGram(a, b)) continue;
      const gram = a + b;
      out.set(gram, (out.get(gram) || 0) + 1);
    }
  }
}

/**
 * 查询分词：返回 [{ term, weight, kind: 'ascii'|'cjk' }]，同 term 取最高权重。
 * 例：`execute_code` -> execute_code(2.0) + execute(1.0) + code(1.0)；`实体伤害` -> 实体/体伤/伤害(各 1.0)
 */
export function tokenizeQuery(query) {
  const text = String(query ?? '').toLowerCase();
  const weights = new Map(); // term -> { weight, kind }

  const add = (term, weight, kind) => {
    const prev = weights.get(term);
    if (!prev || prev.weight < weight) weights.set(term, { weight, kind });
  };

  for (const m of text.matchAll(ASCII_TOKEN_RE)) {
    const token = m[0];
    if (!isUsefulAsciiToken(token)) continue;
    add(token, 2.0, 'ascii');
    if (token.includes('_')) {
      for (const part of token.split('_')) {
        if (isUsefulAsciiToken(part)) add(part, 1.0, 'ascii');
      }
    }
  }

  for (const m of text.matchAll(CJK_RUN_RE)) {
    const run = m[0];
    if (run.length === 1) {
      add(run, 0.8, 'cjk');
      continue;
    }
    for (let i = 0; i + 1 < run.length; i += 1) {
      const a = run[i];
      const b = run[i + 1];
      if (!isUsefulZhGram(a, b)) continue;
      add(a + b, 1.0, 'cjk');
    }
  }

  return [...weights.entries()].map(([term, info]) => ({ term, weight: info.weight, kind: info.kind }));
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 统计 term 在文本中的出现次数（英文按词边界，中文按子串）。 */
export function countOccurrences(text, term, kind) {
  if (!text || !term) return 0;
  const haystack = kind === 'ascii' ? text.toLowerCase() : text;
  if (kind === 'ascii') {
    const re = new RegExp(`(?:^|[^a-z0-9_])${escapeRegExp(term)}(?![a-z0-9_])`, 'g');
    let count = 0;
    while (re.exec(haystack)) {
      count += 1;
      if (re.lastIndex === 0) break;
    }
    return count;
  }
  let count = 0;
  let idx = haystack.indexOf(term);
  while (idx !== -1) {
    count += 1;
    idx = haystack.indexOf(term, idx + term.length);
  }
  return count;
}

/** 返回 term 首次出现的位置（英文忽略前导边界字符），未命中返回 -1。 */
export function findFirstIndex(text, term, kind) {
  if (!text || !term) return -1;
  const haystack = kind === 'ascii' ? text.toLowerCase() : text;
  if (kind === 'ascii') {
    const re = new RegExp(`(?:^|[^a-z0-9_])${escapeRegExp(term)}(?![a-z0-9_])`);
    const m = re.exec(haystack);
    if (!m) return -1;
    return m.index + (m[0].length - term.length);
  }
  return haystack.indexOf(term);
}
