import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// Dynamic import gives the first TDD run an assertion failure, not a loader error.
const module = await import('./check-specs.mjs').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
const cli = fileURLToPath(new URL('./check-specs.mjs', import.meta.url));

function doc(fields = {}, body = '') {
  const fm = { title: 'Fixture', level: 'L1', type: 'architecture', stack: 'desktop',
    parent: './README.md', related: '[]', sources: '[src/code.ts:2]',
    status: 'draft', updated: '2026-11-03', ...fields };
  return '---\n' + Object.entries(fm).filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}: ${v}`).join('\n') + '\n---\n\n# Fixture\n\n## Правила\n\n' +
    body + '\n\n## Навигация\n';
}

function fixture(t, files = {}) {
  const root = mkdtempSync(join(tmpdir(), 'kadr-check-specs-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const all = {
    'src/code.ts': 'first\nsecond\n',
    'Specs/README.md': doc({ level: 'L0', type: 'index', parent: undefined }),
    'Specs/CORE.md': doc(), ...files
  };
  for (const [path, text] of Object.entries(all)) {
    if (text === null) continue;
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  return root;
}

function validate(root) {
  assert.equal(typeof module.validateSpecs, 'function', 'validateSpecs(root) must be exported');
  return module.validateSpecs(root);
}

function hasError(result, code, text = '') {
  assert.ok(result.errors.some(e => e.code === code && e.message.includes(text)),
    `Expected ${code} ${text}; got ${JSON.stringify(result.errors)}`);
}

test('accepts a minimal graph and returns structured stats', t => {
  const result = validate(fixture(t, {
    'Specs/layer/LAYER.md': doc({ level: 'L2', type: 'layer', parent: '../CORE.md' },
      '`src/code.ts:2` [up](../CORE.md#anything) [directory](../../src/)'),
    'Specs/layer/MODULE.md': doc({ level: 'L3', type: 'module', parent: './LAYER.md' })
  }));
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(result.stats.levels, { L0: 1, L1: 1, L2: 1, L3: 1 });
  assert.equal(result.stats.documents, 4);
  assert.equal(result.stats.anchors.checked, 1);
  assert.equal(result.stats.anchors.ok, 1);
});

for (const [field, value] of [
  ['title', undefined], ['level', undefined], ['level', 'L4'], ['level', '[L1]'],
  ['type', 'service'], ['stack', 'backend'], ['status', 'released'],
  ['updated', '2026-02-30'], ['updated', 'yesterday'], ['title', '[]'],
  ['sources', undefined], ['sources', 'src/code.ts'], ['sources', '[true]'],
  ['related', './README.md'], ['related', '[false]'], ['parent', '[]']
]) {
  test(`rejects missing/wrong frontmatter ${field}=${value}`, t => {
    hasError(validate(fixture(t, { 'Specs/CORE.md': doc({ [field]: value }) })), 'frontmatter', field);
  });
}

test('accepts all Kadr stacks and statuses, optional related, and same-level splits', t => {
  const files = {};
  for (const [i, stack] of ['desktop', 'renderer', 'main', 'shared', 'python'].entries()) {
    files[`Specs/STACK${i}.md`] = doc({ stack, status: ['draft', 'stable', 'frozen'][i % 3], related: undefined });
  }
  files['Specs/LAYER.md'] = doc({ level: 'L2', type: 'layer', parent: './CORE.md' });
  files['Specs/SPLIT.md'] = doc({ level: 'L2', type: 'pattern', parent: './LAYER.md' });
  files['Specs/MODULE.md'] = doc({ level: 'L3', type: 'module', parent: './SPLIT.md' });
  files['Specs/DETAIL.md'] = doc({ level: 'L3', type: 'module', parent: './MODULE.md' });
  assert.deepEqual(validate(fixture(t, files)).errors, []);
});

for (const related of ['[./MISSING.md]', '[https://example.org/doc.md]', '[../src/code.ts]']) {
  test(`rejects invalid related ${related}`, t => {
    hasError(validate(fixture(t, { 'Specs/CORE.md': doc({ related }) })), 'related');
  });
}

test('rejects non-root orphans even if linked from README', t => {
  hasError(validate(fixture(t, {
    'Specs/CORE.md': doc({ parent: undefined }),
    'Specs/README.md': doc({ level: 'L0', type: 'index', parent: undefined }, '[core](CORE.md)')
  })), 'parent', 'README');
});

test('rejects a parent outside the normative graph', t => {
  hasError(validate(fixture(t, {
    'Specs/CORE.md': doc({ parent: '../outside.md' }), 'outside.md': '# Outside'
  })), 'parent');
});

test('detects parent cycles', t => {
  hasError(validate(fixture(t, {
    'Specs/CORE.md': doc({ level: 'L2', parent: './OTHER.md' }),
    'Specs/OTHER.md': doc({ level: 'L2', parent: './CORE.md' })
  })), 'parent-cycle');
});

for (const level of ['L1', 'L2', 'L3']) {
  test(`rejects invalid ${level} parent level`, t => {
    hasError(validate(fixture(t, {
      'Specs/CORE.md': doc({ level, parent: './README.md' }),
      ...(level === 'L1' ? { 'Specs/README.md': doc({ level: 'L2', parent: undefined }) } : {})
    })), 'parent-level');
  });
}

test('requires Specs/README.md', t => {
  hasError(validate(fixture(t, { 'Specs/README.md': null })), 'root');
});
test('requires root level L0 and forbids root parent', t => {
  const result = validate(fixture(t, { 'Specs/README.md': doc({ level: 'L1' }) }));
  hasError(result, 'root', 'L0');
  hasError(result, 'root', 'parent');
});

test('checks inline and reference Markdown file links', t => {
  const result = validate(fixture(t, { 'Specs/CORE.md': doc({},
    '[missing](./gone.md#heading)\n[ref][missing]\n[missing]: ./other.md "title"') }));
  hasError(result, 'link', 'gone.md');
  hasError(result, 'link', 'other.md');
});

test('ignores external links, wikilinks, fragments and fenced examples', t => {
  assert.deepEqual(validate(fixture(t, { 'Specs/CORE.md': doc({},
    '[web](https://example.org/no.md) [mail](mailto:a@b) [here](#local) [[wiki]]\n' +
    '```md\n# Example\n[example](no.md)\n`src/missing.ts:123`\n```') })).errors, []);
});

for (const anchor of ['src/missing.ts:1', 'src/code.ts:0', 'src/code.ts:3']) {
  test(`rejects bad repo anchor ${anchor}`, t => {
    hasError(validate(fixture(t, { 'Specs/CORE.md': doc({}, '`' + anchor + '`') })), 'anchor');
  });
}

test('ignores external Windows anchors and template placeholders', t => {
  assert.deepEqual(validate(fixture(t, { 'Specs/CORE.md': doc({},
    '`D:/Repos/foreign/file.ts:99` `D:\\Repos\\foreign\\file.ts:99` ' +
    '`path/to/<file>.ts:NN` `src/{module}.ts:1` `https://example.org/a.ts:1`') })).errors, []);
});

test('checks source file existence, docs pointers and source line ranges', t => {
  const result = validate(fixture(t, { 'Specs/CORE.md': doc({
    sources: '[src/missing.ts, docs/missing.md, src/code.ts:99]'
  }) }));
  hasError(result, 'source', 'src/missing.ts');
  hasError(result, 'source', 'docs/missing.md');
  hasError(result, 'source', 'src/code.ts:99');
});

test('parses quoted inline arrays and multiline scalar lists without splitting colon/comma values', t => {
  assert.deepEqual(validate(fixture(t, {
    'src/a,b.ts': 'line\n',
    'Specs/CORE.md': doc({ title: '"A: title, [example]"',
      related: '\n  - "./README.md"',
      sources: '\n  - src/code.ts:2\n  - "src/a,b.ts:1"\n  - mem:project/context\n  - external:D:/foreign/file.md\n  - https://example.org/doc.md' })
  })).errors, []);
});

test('parses inline quoted commas, colons, brackets and escaped quotes', t => {
  assert.deepEqual(validate(fixture(t, {
    'src/a,b.ts': 'line',
    'Specs/CORE.md': doc({ title: '"Title with \\"quotes\\""',
      related: "['./README.md']",
      sources: '["src/a,b.ts:1", "mem:topic/[a,b]", \'external:it\'\'s/a,b\']' })
  })).errors, []);
});

test('accepts YAML comments without swallowing hashes inside quotes', t => {
  assert.deepEqual(validate(fixture(t, {
    'Specs/CORE.md': doc({ title: '"Title # not a comment" # comment',
      related: '[./README.md] # comment', sources: '# list comment\n  - src/code.ts:2 # comment' })
  })).errors, []);
});

test('rejects duplicate singleton keys', t => {
  hasError(validate(fixture(t, { 'Specs/CORE.md': doc().replace('level: L1', 'level: L1\nlevel: L2') })),
    'frontmatter', 'duplicate');
});

for (const invalid of [
  'title: "unterminated', 'related: ["./README.md"', 'related: [./README.md,,x]',
  'sources:\n  path: src/code.ts', 'title: {nested: mapping}', 'not YAML at all',
  'title: a: mapping', 'related: [./README.md] garbage'
]) {
  test(`rejects malformed/unsupported YAML ${JSON.stringify(invalid)}`, t => {
    const text = doc().replace('title: Fixture', invalid);
    hasError(validate(fixture(t, { 'Specs/CORE.md': text })), 'frontmatter');
  });
}

test('rejects missing or unclosed frontmatter', t => {
  for (const text of ['# Missing', '---\ntitle: Missing\n# Missing']) {
    hasError(validate(fixture(t, { 'Specs/CORE.md': text })), 'frontmatter');
  }
});

test('requires a single H1 and subject rules/navigation sections', t => {
  const result = validate(fixture(t, { 'Specs/CORE.md': doc().replace('## Правила', '# Extra')
    .replace('## Навигация', '## Other') }));
  hasError(result, 'heading');
  hasError(result, 'section', 'Правила');
  hasError(result, 'section', 'Навигация');
});

test('meta/index/process may omit rules but still require navigation', t => {
  for (const type of ['meta', 'index', 'process']) {
    assert.deepEqual(validate(fixture(t, {
      'Specs/CORE.md': doc({ type }).replace('## Правила', '## Specialized')
    })).errors, []);
    hasError(validate(fixture(t, {
      'Specs/CORE.md': doc({ type }).replace('## Навигация', '## Specialized')
    })), 'section');
  }
});

test('ignores templates, archive and node_modules', t => {
  const result = validate(fixture(t, {
    'Specs/templates/BAD.md': '# Incomplete', 'Specs/_archive/BAD.md': '# Old',
    'Specs/node_modules/BAD.md': '# Vendor'
  }));
  assert.deepEqual(result.errors, []);
  assert.equal(result.stats.documents, 2);
});

test('missing Specs reports structured failure rather than throwing', t => {
  const root = fixture(t, { 'Specs/README.md': null, 'Specs/CORE.md': null });
  hasError(validate(root), 'root');
});

test('reports budget warnings without failing and keeps repeated validation deterministic', t => {
  const root = fixture(t, { 'Specs/CORE.md': doc({}, 'line\n'.repeat(225)) });
  const result = validate(root);
  assert.deepEqual(result.errors, []);
  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0].code, 'budget');
  assert.deepEqual(validate(root), result);
});

test('CLI supports --root and cwd defaults, prints deterministic result and exits nonzero on failure', t => {
  const root = fixture(t);
  const pass = spawnSync(process.execPath, [cli, '--root', root], { encoding: 'utf8' });
  assert.equal(pass.status, 0, pass.stdout + pass.stderr);
  assert.match(pass.stdout, /RESULT: PASS/);
  assert.match(pass.stdout, /L0=1.*L1=1.*L2=0.*L3=0/);
  const cwd = spawnSync(process.execPath, [cli], { cwd: root, encoding: 'utf8' });
  assert.equal(cwd.stdout, pass.stdout);
  writeFileSync(join(root, 'Specs/CORE.md'), doc({ level: 'bad' }));
  const fail = spawnSync(process.execPath, [cli, '--root', root], { encoding: 'utf8' });
  assert.equal(fail.status, 1);
  assert.match(fail.stdout, /RESULT: FAIL/);
  assert.match(fail.stdout, /Specs\/CORE.md.*level/);
});

test('CLI rejects unknown/missing arguments', () => {
  for (const args of [['--root'], ['--unknown']]) {
    const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Usage:/);
  }
});

for (const [code, example] of [
  ['link', '[missing](./MISSING.md)'], ['anchor', '`src/missing.ts:1`']
]) {
  test(`review 1: leading triple-backtick inline span must not hide following ${code}`, t => {
    const root = fixture(t, { 'Specs/CORE.md': doc({},
      '## Навигация\n\n```example```\n\n' + example) });
    hasError(validate(root), code);
  });
}

for (const title of ['- invalid', '? invalid']) {
  test(`review 2: rejects reserved YAML plain scalar ${title}`, t => {
    hasError(validate(fixture(t, { 'Specs/CORE.md': doc({ title }) })), 'frontmatter');
  });
}

test('review 2: permits quoted indicators and plain indicators without separation', t => {
  for (const title of ['"- valid"', "'? valid'", '-valid', '?valid', ':valid']) {
    assert.deepEqual(validate(fixture(t, { 'Specs/CORE.md': doc({ title }) })).errors, []);
  }
});

function directoryLink(target, path) {
  // Windows junctions need no symlink privilege; POSIX uses an ordinary directory symlink.
  symlinkSync(target, path, process.platform === 'win32' ? 'junction' : 'dir');
}

for (const [kind, fields, body] of [
  ['source', { sources: '[linked/private.ts:1]' }, ''],
  ['anchor', {}, '`linked/private.ts:1`'],
  ['related', { related: '[../linked/PRIVATE.md]' }, ''],
  ['link', {}, '[private](../linked/PRIVATE.md)'],
  ['directory link', {}, '[directory](../linked/)']
]) {
  test(`review 3: rejects an external junction/symlink ${kind}`, t => {
    const root = fixture(t, { 'Specs/CORE.md': doc(fields, body) });
    const outside = mkdtempSync(join(tmpdir(), 'kadr-check-specs-outside-'));
    t.after(() => rmSync(outside, { recursive: true, force: true }));
    writeFileSync(join(outside, 'private.ts'), 'private\n');
    writeFileSync(join(outside, 'PRIVATE.md'), '# Private\n');
    directoryLink(outside, join(root, 'linked'));
    const result = validate(root);
    hasError(result, kind === 'directory link' ? 'link' : kind);
    assert.deepEqual(validate(root), result, 'canonical boundary diagnostics must be deterministic');
  });
}

test('review 3: accepts junction/symlink targets that stay inside the canonical repo', t => {
  const root = fixture(t, { 'Specs/CORE.md': doc({ sources: '[linked/code.ts:1]' },
    '`linked/code.ts:2` [directory](../linked/)') });
  directoryLink(join(root, 'src'), join(root, 'linked'));
  assert.deepEqual(validate(root).errors, []);
});

test('review 3: refuses a Specs junction pointing outside the repository', t => {
  const root = fixture(t, { 'Specs/README.md': null, 'Specs/CORE.md': null });
  const outside = fixture(t);
  directoryLink(join(outside, 'Specs'), join(root, 'Specs'));
  const result = validate(root);
  hasError(result, 'root');
  assert.equal(result.stats.documents, 0);
});

test('review 3: accepts a repository root reached through a junction/symlink', t => {
  const root = fixture(t);
  const aliases = mkdtempSync(join(tmpdir(), 'kadr-check-specs-alias-'));
  t.after(() => rmSync(aliases, { recursive: true, force: true }));
  directoryLink(root, join(aliases, 'repo'));
  assert.deepEqual(validate(join(aliases, 'repo')).errors, []);
});

test('review 4: ignores IPv4 endpoints but retains missing code anchor diagnostics', t => {
  const root = fixture(t, { 'Specs/CORE.md': doc({},
    '`127.0.0.1:9777` `192.168.0.1:8080` `src/missing.ts:1`') });
  const result = validate(root);
  assert.equal(result.stats.anchors.checked, 1);
  assert.equal(result.errors.length, 1);
  hasError(result, 'anchor', 'src/missing.ts:1');
});

test('review 5: ignores Markdown link syntax inside inline code spans', t => {
  const root = fixture(t, { 'Specs/CORE.md': doc({},
    '`[label](./MISSING.md)` and ``[label](./OTHER.md) with ` tick``') });
  assert.deepEqual(validate(root).errors, []);
});

test('review 5: escaped backticks must not mask a real Markdown link', t => {
  hasError(validate(fixture(t, { 'Specs/CORE.md': doc({},
    '\\`[label](./MISSING.md)\\`') })), 'link', 'MISSING.md');
});

test('review 5: unmatched code delimiters cannot hide links in a separate paragraph', t => {
  hasError(validate(fixture(t, { 'Specs/CORE.md': doc({},
    '`unmatched\n\n[label](./MISSING.md)\n\nseparate paragraph`') })), 'link', 'MISSING.md');
});

test('review 5: masks multiline code within a paragraph, including a backslash before the closing tick', t => {
  assert.deepEqual(validate(fixture(t, { 'Specs/CORE.md': doc({},
    '`example\n[label](./MISSING.md)\\`') })).errors, []);
});

for (const [quote, marker] of [['> ', '```md'], ['> ', '~~~md'], ['> > ', '```md']]) {
  test(`review 5: ignores blockquote-contained fenced examples ${quote}${marker}`, t => {
    const close = marker.slice(0, 3);
    const root = fixture(t, { 'Specs/CORE.md': doc({},
      `${quote}${marker}\n${quote}[label](./MISSING.md)\n${quote}\`src/missing.ts:1\`\n${quote}${close}\n`) });
    const result = validate(root);
    assert.deepEqual(result.errors, []);
    assert.equal(result.stats.anchors.checked, 0);
  });
}

test('review 5: checks links and intentional inline anchors outside quoted fences', t => {
  const root = fixture(t, { 'Specs/CORE.md': doc({},
    '> ```md\n> [example](./EXAMPLE.md)\n> ```\n\n' +
    '[real](./MISSING.md) `src/missing.ts:1`') });
  const result = validate(root);
  assert.equal(result.errors.length, 2);
  hasError(result, 'link', 'MISSING.md');
  hasError(result, 'anchor', 'src/missing.ts:1');
});
