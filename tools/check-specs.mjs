// Standalone Specs integrity check. Only Node builtins; importing has no side effects.
// Usage: node tools/check-specs.mjs [--root <repository>]
import { readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { isIP } from 'node:net';
import { fileURLToPath } from 'node:url';

const TYPES = ['index', 'meta', 'process', 'architecture', 'layer', 'pattern', 'module'];
const STACKS = ['desktop', 'renderer', 'main', 'shared', 'python'];
const LEVELS = ['L0', 'L1', 'L2', 'L3'];
const SKIP = new Set(['templates', '_archive', 'node_modules', '.git']);
const slash = value => value.replace(/\\/g, '/');
const external = value => /^(?:mem:|external:|[a-z][a-z\d+.-]*:\/\/)/i.test(value);
const absolute = value => isAbsolute(value) || /^[a-z]:[\\/]/i.test(value) || /^\\\\/.test(value);
const placeholder = value => /[<>{}]|\$\(|\$\{|\bNN\b/.test(value);

function stat(path) {
  try { return statSync(path); } catch { return null; }
}

function inside(root, path) {
  const rel = relative(root, path);
  return rel !== '..' && !rel.startsWith('..' + (process.platform === 'win32' ? '\\' : '/')) && !isAbsolute(rel);
}

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1)) {
    if (SKIP.has(entry.name)) continue;
    const path = join(dir, entry.name);
    // Never traverse symlinks (cycles and dependencies outside the repository).
    if (entry.isDirectory()) files.push(...walk(path));
    else if (entry.isFile() && /\.md$/i.test(entry.name)) files.push(path);
  }
  return files;
}

// Deliberately small YAML subset: scalar fields, inline arrays and dash scalar lists.
// Reject unsupported syntax instead of silently accepting a corrupted contract.
function scalar(raw) {
  const value = raw.trim();
  if (!value) return null;
  if (value[0] === '"') {
    const match = value.match(/^"(?:[^"\\]|\\.)*"/);
    if (!match || !/^\s*(?:#.*)?$/.test(value.slice(match[0].length))) throw Error('invalid quoted scalar');
    try { return JSON.parse(match[0]); } catch { throw Error('invalid quoted scalar'); }
  }
  if (value[0] === "'") {
    const match = value.match(/^'(?:[^']|'')*'/);
    if (!match || !/^\s*(?:#.*)?$/.test(value.slice(match[0].length))) throw Error('invalid quoted scalar');
    return match[0].slice(1, -1).replace(/''/g, "'");
  }
  const plain = value.replace(/\s+#.*$/, '').trim();
  if (/^[\[\]{}|>&*!%@`]/.test(plain) || /^[-?:](?:\s|$)/.test(plain) || /:\s|[\[\]{}]/.test(plain)) throw Error('unsupported scalar/mapping syntax');
  if (/^(?:null|~)$/i.test(plain)) return null;
  if (/^(?:true|false)$/i.test(plain)) return plain.toLowerCase() === 'true';
  if (/^[+-]?\d+(?:\.\d+)?$/.test(plain)) return Number(plain);
  return plain;
}

function value(raw) {
  if (!raw.trim().startsWith('[')) return scalar(raw);
  const text = raw.trim();
  const parts = [];
  let start = 1, quote = null, closed = false;
  for (let i = 1; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (quote === '"' && c === '\\') { i++; continue; }
      if (c === quote) {
        if (quote === "'" && text[i + 1] === "'") { i++; continue; }
        quote = null;
      }
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '[' || c === '{') throw Error('nested collections are unsupported');
    else if (c === ',' || c === ']') {
      const part = text.slice(start, i).trim();
      if (part) parts.push(scalar(part));
      else if (c === ',' || parts.length) throw Error('empty array item');
      start = i + 1;
      if (c === ']') {
        if (!/^\s*(?:#.*)?$/.test(text.slice(i + 1))) throw Error('unexpected text after array');
        closed = true;
        break;
      }
    }
  }
  if (!closed || quote) throw Error('unclosed array or quote');
  return parts;
}

function frontmatter(text, report) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const end = lines.findIndex((line, i) => i > 0 && line.trim() === '---');
  if (lines[0] !== '---' || end < 0) {
    report('frontmatter', 'missing or unclosed frontmatter', 1);
    return { fm: Object.create(null), body: text, offset: 0 };
  }
  const fm = Object.create(null);
  let listKey = null;
  for (let i = 1; i < end; i++) {
    const line = lines[i];
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const field = line.match(/^([a-zA-Z][\w-]*):(?:\s+(.*)|\s*)$/);
    const item = line.match(/^\s+-\s+(.+)$/);
    try {
      if (field) {
        const [, key, raw = ''] = field;
        if (Object.hasOwn(fm, key)) { report('frontmatter', `duplicate key '${key}'`, i + 1); listKey = null; continue; }
        listKey = !raw.trim() || /^#/.test(raw.trim()) ? key : null;
        fm[key] = listKey ? [] : value(raw);
      } else if (item && listKey) {
        fm[listKey].push(scalar(item[1]));
      } else throw Error('expected a field or dash scalar list item');
    } catch (error) {
      report('frontmatter', error.message, i + 1);
      listKey = null;
    }
  }
  return { fm, body: lines.slice(end + 1).join('\n'), offset: end + 1 };
}

function withoutFences(body) {
  let fence = null;
  return body.split('\n').map(line => {
    let content = line, depth = 0, prefix;
    // Inside a quoted fence, additional '>' characters belong to the example.
    while ((!fence || depth < fence.depth) && (prefix = content.match(/^ {0,3}>[ \t]?/))) {
      content = content.slice(prefix[0].length);
      depth++;
    }
    // A fenced block cannot lazily continue outside its blockquote container.
    if (fence && depth < fence.depth) fence = null;
    const mark = content.match(/^ {0,3}(`{3,}|~{3,})/);
    // Backtick fence info strings cannot themselves contain a backtick.
    if (!fence && mark && (mark[1][0] !== '`' || !content.slice(mark[0].length).includes('`'))) {
      fence = { marker: mark[1], depth }; return '';
    }
    if (fence) {
      if (new RegExp(`^ {0,3}${fence.marker[0]}{${fence.marker.length},}\\s*$`).test(content)) fence = null;
      return '';
    }
    return line;
  }).join('\n');
}

function withoutInlineCode(text) {
  const runs = [...text.matchAll(/`+/g)];
  let out = '', cursor = 0;
  for (let i = 0; i < runs.length; i++) {
    const open = runs[i];
    let escapes = 0;
    for (let j = open.index - 1; j >= 0 && text[j] === '\\'; j--) escapes++;
    if (escapes % 2) continue;
    let end = i + 1;
    while (end < runs.length && runs[end][0].length !== open[0].length) end++;
    if (end === runs.length) continue; // An unmatched backtick run is literal text.
    // Code spans may wrap within a paragraph, never across a blank block boundary.
    if (/\n[ \t]*\n/.test(text.slice(open.index, runs[end].index))) continue;
    const stop = runs[end].index + runs[end][0].length;
    out += text.slice(cursor, open.index) + text.slice(open.index, stop).replace(/[^\n]/g, ' ');
    cursor = stop;
    i = end;
  }
  return out + text.slice(cursor);
}

function filePart(target) {
  return target.split(/[?#]/, 1)[0];
}

function docTarget(file, target) {
  if (typeof target !== 'string' || absolute(target) || /^[a-z][\w+.-]*:/i.test(target)) return null;
  const path = filePart(target);
  if (!/\.md$/i.test(path)) return null;
  return resolve(dirname(file), slash(path));
}

function lineCount(text) {
  // A final newline terminates the last line; it is not an extra addressable line.
  return text === '' ? 0 : text.split(/\r?\n/).length - (text.endsWith('\n') ? 1 : 0);
}

/** Returns { errors, warnings, stats }; diagnostics have { file, line, code, message }.
 * Stats count active Markdown documents by declared level and inline code anchors.
 * Sources are checked separately so listing evidence does not inflate anchor counts.
 */
export function validateSpecs(root = process.cwd()) {
  root = resolve(root);
  const specs = join(root, 'Specs');
  const errors = [], warnings = [];
  const stats = { documents: 0, levels: { L0: 0, L1: 0, L2: 0, L3: 0 },
    anchors: { checked: 0, ok: 0, unresolved: 0, badLine: 0 } };
  const reportFor = file => (code, message, line = 1) => errors.push({ file: slash(relative(root, file)), line, code, message });
  const rootFile = join(specs, 'README.md');
  if (!stat(specs)?.isDirectory()) {
    reportFor(rootFile)('root', 'Specs directory / README.md is missing');
    return { errors, warnings, stats };
  }
  const canonicalRoot = realpathSync(root);
  function repoPath(path) {
    if (!inside(root, path)) return null;
    try {
      const canonical = realpathSync(path);
      return inside(canonicalRoot, canonical) ? canonical : null;
    } catch { return null; }
  }
  if (!repoPath(specs)) {
    reportFor(rootFile)('root', 'Specs directory resolves outside the repository');
    return { errors, warnings, stats };
  }
  const docs = new Map();
  const counts = new Map();
  function checkEvidence(target) {
    const match = target.match(/^(.*?):(\d+)(?:-(\d+))?$/);
    const path = match ? match[1] : filePart(target);
    const file = absolute(path) ? null : repoPath(resolve(root, slash(path)));
    if (!file || !stat(file)?.isFile()) return { kind: 'unresolved', message: `file not found or not repo-relative: ${target}` };
    if (match) {
      if (!counts.has(file)) counts.set(file, lineCount(readFileSync(file, 'utf8')));
      const first = Number(match[2]), last = Number(match[3] ?? match[2]);
      if (first < 1 || last < first || last > counts.get(file)) return { kind: 'badLine', message: `line out of range: ${target} (file has ${counts.get(file)} lines)` };
    }
    return null;
  }
  for (const file of walk(specs)) {
    const report = reportFor(file);
    let text;
    const canonical = repoPath(file);
    if (!canonical) { report('read', 'document resolves outside the repository or is missing'); continue; }
    try { text = readFileSync(canonical, 'utf8'); } catch (error) { report('read', error.message); continue; }
    const { fm, body, offset } = frontmatter(text, report);
    docs.set(file, { fm, parent: null });
    stats.documents++;
    if (LEVELS.includes(fm.level)) stats.levels[fm.level]++;
    for (const key of ['title', 'level', 'type', 'stack', 'status', 'updated']) {
      if (typeof fm[key] !== 'string' || !fm[key].trim()) report('frontmatter', `${key} must be a non-empty string`);
    }
    for (const [key, allowed] of [['level', LEVELS], ['type', TYPES], ['stack', STACKS], ['status', ['draft', 'stable', 'frozen']]]) {
      if (!allowed.includes(fm[key])) report('frontmatter', `${key} must be one of ${allowed.join(', ')}`);
    }
    if (typeof fm.updated === 'string' && (!/^\d{4}-\d{2}-\d{2}$/.test(fm.updated) ||
      !Number.isFinite(Date.parse(fm.updated)) || new Date(fm.updated).toISOString().slice(0, 10) !== fm.updated)) report('frontmatter', 'updated must be a valid ISO date YYYY-MM-DD');
    for (const key of ['sources', 'related']) {
      if (key === 'related' && !Object.hasOwn(fm, key)) continue;
      if (!Array.isArray(fm[key]) || fm[key].some(item => typeof item !== 'string' || !item.trim())) report('frontmatter', `${key} must be a list of non-empty strings`);
    }
    if (file === rootFile) {
      if (fm.level !== 'L0') report('root', 'Specs/README.md must have level L0');
      if (Object.hasOwn(fm, 'parent')) report('root', 'Specs/README.md must not have a parent');
    } else {
      if (typeof fm.parent !== 'string' || !fm.parent.trim()) report('frontmatter', 'parent must be a non-empty string');
      const parent = docTarget(file, fm.parent);
      docs.get(file).parent = parent;
      if (!parent) report('parent', 'parent must be a relative .md path leading to Specs/README.md');
      else if (!repoPath(parent)) report('parent', 'parent is missing or resolves outside the repository');
    }
    if (Array.isArray(fm.related)) for (const target of fm.related) {
      const path = docTarget(file, target);
      const canonical = path && repoPath(path);
      if (!canonical || !stat(canonical)?.isFile()) report('related', `related must point to an existing relative .md file inside the repository: ${String(target)}`);
    }
    if (Array.isArray(fm.sources)) for (const target of fm.sources) {
      if (typeof target !== 'string' || external(target)) continue;
      const problem = checkEvidence(target);
      if (problem) report('source', problem.message);
    }
    const clean = withoutFences(body);
    const headings = [...clean.matchAll(/^ {0,3}#\s+.+$/gm)].length;
    if (headings !== 1) report('heading', `expected exactly one H1, found ${headings}`);
    const sections = [...clean.matchAll(/^ {0,3}##\s+(.+?)\s*#*\s*$/gm)].map(m => m[1].toLowerCase());
    if (!sections.some(s => s === 'навигация' || s === 'navigation')) report('section', 'missing ## Навигация (Navigation)');
    if (!['meta', 'index', 'process'].includes(fm.type) && !sections.some(s => s === 'правила' || s === 'rules')) report('section', 'missing ## Правила (Rules)');
    const linkText = withoutInlineCode(clean);
    const links = [...linkText.matchAll(/\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+[^)]*)?\)/g),
      ...linkText.matchAll(/^ {0,3}\[[^\]]+\]:\s*(<[^>]+>|\S+)/gm)];
    for (const match of links) {
      const target = match[1].replace(/^<|>$/g, '');
      if (/^(?:[a-z][\w+.-]*:|\/\/|#)/i.test(target) || absolute(target) || placeholder(target)) continue;
      let path;
      try { path = decodeURIComponent(filePart(target)); } catch { report('link', `invalid URL encoding: ${target}`); continue; }
      if (path && !repoPath(resolve(dirname(file), slash(path)))) report('link', `missing relative file link or target outside repository: ${target}`);
    }
    for (const match of clean.matchAll(/`([^`\n]+)`/g)) {
      const target = match[1];
      if (!/^.+\.[\w-]+:\d+(?:-\d+)?$/.test(target) || absolute(target) || external(target) || placeholder(target) ||
        isIP(target.slice(0, target.lastIndexOf(':'))) === 4) continue;
      stats.anchors.checked++;
      const problem = checkEvidence(target);
      if (problem) {
        stats.anchors[problem.kind]++;
        report('anchor', problem.message, offset + clean.slice(0, match.index).split('\n').length);
      } else stats.anchors.ok++;
    }
    const lines = lineCount(text);
    if (lines > 220) warnings.push({ file: slash(relative(root, file)), line: 1, code: 'budget', message: `${lines} lines exceeds the 220-line guideline` });
  }
  if (!docs.has(rootFile)) reportFor(rootFile)('root', 'Specs/README.md is missing');
  const parentLevels = { L1: ['L0'], L2: ['L1', 'L2'], L3: ['L2', 'L3'] };
  for (const [file, doc] of docs) {
    if (file === rootFile) continue;
    const report = reportFor(file);
    if (doc.parent && !docs.has(doc.parent)) report('parent', `parent is outside the active Specs graph: ${slash(relative(root, doc.parent))}`);
    if (docs.has(doc.parent) && parentLevels[doc.fm.level] && !parentLevels[doc.fm.level].includes(docs.get(doc.parent).fm.level)) {
      report('parent-level', `${doc.fm.level} parent must be ${parentLevels[doc.fm.level].join(' or ')}`);
    }
    const chain = new Set();
    let current = file;
    while (current !== rootFile && docs.has(current) && !chain.has(current)) {
      chain.add(current);
      current = docs.get(current).parent;
    }
    if (chain.has(current)) report('parent-cycle', 'parent cycle: ' + [...chain, current].map(p => slash(relative(root, p))).join(' -> '));
    else if (current !== rootFile) report('parent', 'orphan: parent chain does not reach Specs/README.md');
  }
  const sort = (a, b) => {
    const x = `${a.file}\0${String(a.line).padStart(9, '0')}\0${a.code}\0${a.message}`;
    const y = `${b.file}\0${String(b.line).padStart(9, '0')}\0${b.code}\0${b.message}`;
    return x < y ? -1 : x > y ? 1 : 0;
  };
  errors.sort(sort);
  warnings.sort(sort);
  return { errors, warnings, stats };
}

function main(args) {
  if (args.length && (args.length !== 2 || args[0] !== '--root' || !args[1] || args[1].startsWith('--'))) {
    console.error('Usage: node tools/check-specs.mjs [--root <repository>]');
    return 2;
  }
  try {
    const { errors, warnings, stats } = validateSpecs(args[1] ?? process.cwd());
    console.log(`Specs: ${stats.documents} documents; ${Object.entries(stats.levels).map(([k, v]) => `${k}=${v}`).join(' ')}`);
    console.log(`anchors: ${Object.entries(stats.anchors).map(([k, v]) => `${k}=${v}`).join(' ')}`);
    for (const [label, items] of [['ERROR', errors], ['WARNING', warnings]]) {
      console.log(`${label}S: ${items.length}`);
      for (const item of items) console.log(`${label} [${item.code}] ${item.file}:${item.line}: ${item.message}`);
    }
    console.log(errors.length ? 'RESULT: FAIL' : 'RESULT: PASS');
    return errors.length ? 1 : 0;
  } catch (error) {
    console.error(`ERROR: ${error.message}\nRESULT: FAIL`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
