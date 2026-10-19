import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const validatorSource = await readFile(new URL('../lib/procedure-validation.ts', import.meta.url), 'utf8');
const validatorCompiled = ts.transpile(validatorSource, {
  module: ts.ModuleKind.ESNext,
  target: ts.ScriptTarget.ES2022,
});
const validatorUrl = `data:text/javascript;base64,${Buffer.from(validatorCompiled).toString('base64')}`;
const source = await readFile(new URL('../lib/procedures.ts', import.meta.url), 'utf8');
const compiled = ts.transpile(source, {
  module: ts.ModuleKind.ESNext,
  target: ts.ScriptTarget.ES2022,
}).replace("'./procedure-validation'", `'${validatorUrl}'`);
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
const { getProcedure, saveProcedure } = await import(moduleUrl);

function procedure(overrides = {}) {
  return {
    origin: 'https://example.com',
    schemaVersion: 2,
    inputSelector: 'textarea',
    sendStrategy: { method: 'button', selector: 'button[type="submit"]', confidence: 1 },
    updatedAt: 2000,
    lastSuccessAt: 2000,
    successCount: 1,
    failureCount: 0,
    ...overrides,
  };
}

test('getProcedure ignores malformed stored procedures', async () => {
  const previousBrowser = globalThis.browser;
  globalThis.browser = {
    storage: { local: { get: async () => ({ chatAutomationProcedures: {
      'https://example.com': procedure({ inputSelector: '' }),
      'https://other.example': procedure({ origin: 'https://spoof.example' }),
    } }) } },
  };
  try {
    assert.equal(await getProcedure('https://example.com'), undefined);
    assert.equal(await getProcedure('https://other.example'), undefined);
  } finally {
    if (previousBrowser === undefined) delete globalThis.browser;
    else globalThis.browser = previousBrowser;
  }
});

test('saveProcedure rejects invalid procedure data before storage writes', async () => {
  const previousBrowser = globalThis.browser;
  let writes = 0;
  globalThis.browser = {
    storage: { local: {
      get: async () => ({ chatAutomationProcedures: {} }),
      set: async () => { writes += 1; },
    } },
  };
  try {
    await assert.rejects(saveProcedure(procedure({ inputSelector: '' }),), /invalid chat-site procedure/);
    assert.equal(writes, 0);
  } finally {
    if (previousBrowser === undefined) delete globalThis.browser;
    else globalThis.browser = previousBrowser;
  }
});

test('saveProcedure preserves valid entries and removes invalid stored records', async () => {
  const previousBrowser = globalThis.browser;
  let written;
  globalThis.browser = {
    storage: { local: {
      get: async () => ({ chatAutomationProcedures: {
        'https://example.com': procedure(),
        'https://bad.example': { schemaVersion: 2, inputSelector: null },
      } }),
      set: async value => { written = value.chatAutomationProcedures; },
    } },
  };
  try {
    await saveProcedure(procedure({
      origin: 'https://new.example',
      inputSelector: '[contenteditable="true"]',
      updatedAt: 3000,
      lastSuccessAt: 3000,
    }));
    assert.deepEqual(Object.keys(written).sort(), ['https://example.com', 'https://new.example']);
    assert.equal(written['https://example.com'].origin, 'https://example.com');
  } finally {
    if (previousBrowser === undefined) delete globalThis.browser;
    else globalThis.browser = previousBrowser;
  }
});
