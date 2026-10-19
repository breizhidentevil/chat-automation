import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../services/file-export.ts', import.meta.url), 'utf8');
const compiled = ts.transpile(source, { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 });
const { serializeJsonExport } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

test('serializes JSON exports with indentation and preserves nested values', () => {
  assert.equal(serializeJsonExport({ site: 'https://example.test', messages: [{ content: 'Hello' }] }), JSON.stringify({
    site: 'https://example.test', messages: [{ content: 'Hello' }],
  }, null, 2));
});

test('serializes null and primitive payloads safely', () => {
  assert.equal(serializeJsonExport(null), 'null');
  assert.equal(serializeJsonExport('hello'), '"hello"');
});
