import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../lib/site-origin.ts', import.meta.url), 'utf8');
const compiled = ts.transpile(source, {
  module: ts.ModuleKind.ESNext,
  target: ts.ScriptTarget.ES2022,
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
const { getSupportedSiteOrigin } = await import(moduleUrl);

test('accepts HTTP and HTTPS URLs and returns only their origin', () => {
  assert.equal(getSupportedSiteOrigin('https://example.com/path?q=1'), 'https://example.com');
  assert.equal(getSupportedSiteOrigin('http://localhost:3000/page'), 'http://localhost:3000');
});

test('rejects browser-internal and non-web protocols', () => {
  assert.equal(getSupportedSiteOrigin('chrome://extensions'), null);
  assert.equal(getSupportedSiteOrigin('about:blank'), null);
  assert.equal(getSupportedSiteOrigin('file:///tmp/page.html'), null);
  assert.equal(getSupportedSiteOrigin('javascript:alert(1)'), null);
});

test('rejects absent and malformed URLs', () => {
  assert.equal(getSupportedSiteOrigin(undefined), null);
  assert.equal(getSupportedSiteOrigin(''), null);
  assert.equal(getSupportedSiteOrigin('not a URL'), null);
});
