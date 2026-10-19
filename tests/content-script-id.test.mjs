import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../lib/content-script-id.ts', import.meta.url), 'utf8');
const compiled = ts.transpile(source, {
  module: ts.ModuleKind.ESNext,
  target: ts.ScriptTarget.ES2022,
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
const { contentScriptIdForOrigin } = await import(moduleUrl);

test('produces stable browser-safe IDs for origins with punctuation differences', () => {
  const origins = [
    'https://example.com',
    'https://example.com:8443',
    'https://example_com',
    'https://example-com',
    'http://example.com',
  ];
  const ids = origins.map(contentScriptIdForOrigin);
  assert.equal(new Set(ids).size, origins.length);
  assert.ok(ids.every(id => /^chat-automation-[a-f0-9]{8}$/.test(id)));
  assert.equal(contentScriptIdForOrigin(origins[0]), contentScriptIdForOrigin(origins[0]));
});
