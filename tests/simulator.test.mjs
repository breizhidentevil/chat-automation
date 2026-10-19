import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function loadTypeScriptModule(path, replacements = []) {
  let source = await readFile(new URL(path, import.meta.url), 'utf8');
  source = ts.transpile(source, { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 });
  for (const [from, to] of replacements) source = source.replace(from, to);
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

const variablesUrl = `data:text/javascript;base64,${Buffer.from(
  ts.transpile(
    (await readFile(new URL('../lib/variables.ts', import.meta.url), 'utf8')),
    { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  ).replace("from 'liquidjs'", `from '${import.meta.resolve('liquidjs')}'`),
).toString('base64')}`;
const simulatorSource = await readFile(new URL('../lib/simulator.ts', import.meta.url), 'utf8');
const compiledSimulator = ts.transpile(simulatorSource, { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 })
  .replace("from './variables'", `from '${variablesUrl}'`);
const { simulateAutomation, nextSimulationTime } = await import(
  `data:text/javascript;base64,${Buffer.from(compiledSimulator).toString('base64')}`,
);

const startAt = new Date('2026-10-19T09:00:00.000Z');
const variable = (name, value, scope = 'automation') => ({
  id: `${scope}:${name}`, name, type: 'static', value, scope, updatedAt: 0,
});
const config = (overrides = {}) => ({
  messages: ['Bonjour {{ prenom | capitalize }}', 'Cycle {{ automation.sequence.iteration }} — {{ data.ticket }}'],
  variables: [variable('prenom', 'marie')],
  intervalMs: 30_000,
  repeatCount: 2,
  startAt,
  timeWindowEnabled: false,
  startTime: '09:00',
  endTime: '18:00',
  dynamicData: { data: { ticket: 'A-123' } },
  ...overrides,
});

test('simulates Liquid rendering and multiple cycles without sending messages', async () => {
  const result = await simulateAutomation(config());
  assert.equal(result.entries.length, 4);
  assert.equal(result.successful, 4);
  assert.equal(result.failed, 0);
  assert.equal(result.entries[0].renderedText, 'Bonjour Marie');
  assert.equal(result.entries[1].renderedText, 'Cycle 1 — A-123');
  assert.equal(result.entries[2].renderedText, 'Bonjour Marie');
  assert.equal(result.entries[3].renderedText, 'Cycle 2 — A-123');
  assert.equal(result.entries[1].scheduledAt, new Date(startAt.getTime() + 30_000).toISOString());
  assert.equal(result.simulatedDurationMs, 90_000);
});

test('a rendering error is reported in the timeline and does not abort later entries', async () => {
  const result = await simulateAutomation(config({
    messages: ['{{missing}}', 'Message valide'],
    repeatCount: 1,
  }));
  assert.equal(result.failed, 1);
  assert.match(result.entries[0].error, /Variable\(s\) inconnue\(s\)/);
  assert.equal(result.entries[1].renderedText, 'Message valide');
});

test('moves a scheduled message to the next daytime window', () => {
  const candidate = new Date(2026, 9, 19, 20, 30, 0, 0);
  const next = nextSimulationTime(candidate, true, '09:00', '18:00');
  assert.equal(next.getDate(), 20);
  assert.equal(next.getHours(), 9);
  assert.equal(next.getMinutes(), 0);
});

test('supports overnight windows', () => {
  const candidate = new Date(2026, 9, 19, 12, 30, 0, 0);
  const next = nextSimulationTime(candidate, true, '22:00', '06:00');
  assert.equal(next.getDate(), 19);
  assert.equal(next.getHours(), 22);
});

test('rejects an excessive cycle count and invalid time windows', async () => {
  await assert.rejects(simulateAutomation(config({ repeatCount: 11 })), /1 à 10 cycles/);
  await assert.rejects(simulateAutomation(config({ timeWindowEnabled: true, startTime: '09:00', endTime: '09:00' })), /doivent être différentes/);
});
