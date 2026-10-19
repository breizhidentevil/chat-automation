import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('shared React UI primitives expose explicit variants and semantic containers', async () => {
  const source = await readFile(new URL('./ui.tsx', import.meta.url), 'utf8');
  assert.match(source, /export function Button/);
  assert.match(source, /'primary' \| 'secondary' \| 'danger' \| 'tab' \| 'icon'/);
  assert.match(source, /export function Card/);
  assert.match(source, /export function Badge/);
  assert.match(source, /type = 'button'/);
  assert.match(source, /ui-card__content/);
});
