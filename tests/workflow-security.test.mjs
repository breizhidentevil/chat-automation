import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(new URL('../.github/workflows/build-and-publish.yml', import.meta.url), 'utf8');
const dependabot = await readFile(new URL('../.github/dependabot.yml', import.meta.url), 'utf8');

test('pins every GitHub Action to a full commit SHA', () => {
  const references = [...workflow.matchAll(/^\s+uses:\s+([^\s#]+)/gm)].map(match => match[1]);
  assert.ok(references.length > 0, 'workflow should use GitHub Actions');
  for (const reference of references) {
    assert.match(reference, /^[^@]+@[0-9a-f]{40}$/, `Action must be pinned to a full SHA: ${reference}`);
  }
});

test('keeps write permissions out of the build job', () => {
  assert.match(workflow, /permissions:\s*\n\s+contents:\s+read\s*\n/);
  assert.match(workflow, /build:[\s\S]*?permissions:\s*\n\s+contents:\s+read\s*\n/);
  assert.match(workflow, /deploy-pages:[\s\S]*?permissions:\s*\n\s+pages:\s+write\s*\n\s+id-token:\s+write/);
  assert.match(workflow, /publish-release:[\s\S]*?permissions:\s*\n\s+contents:\s+write/);
});

test('limits publishing and Pages deployment to trusted push events', () => {
  assert.match(workflow, /deploy-pages:[\s\S]*?if: github\.event_name == 'push'/);
  assert.match(workflow, /publish-release:[\s\S]*?if: github\.event_name == 'push'/);
});

test('checks npm and GitHub Actions dependencies weekly with Dependabot', () => {
  assert.match(dependabot, /^version:\s*2\s*$/m);
  assert.match(dependabot, /package-ecosystem:\s*npm[\s\S]*?directory:\s*["']\/["'][\s\S]*?interval:\s*weekly/);
  assert.match(dependabot, /package-ecosystem:\s*github-actions[\s\S]*?directory:\s*["']\/["'][\s\S]*?interval:\s*weekly/);
  assert.match(dependabot, /open-pull-requests-limit:\s*5/);
});


test('audits npm dependencies for high-severity vulnerabilities in CI', () => {
  assert.match(workflow, /name: Audit npm dependencies for high-severity vulnerabilities\s+run: npm audit --audit-level=high/);
});


test('uses a supported Node.js version for the build toolchain', () => {
  assert.match(workflow, /node-version:\s*22\s*$/m);
});


test('bounds CI runtime so browser tooling cannot block the workflow indefinitely', () => {
  assert.match(workflow, /build:\\s*\\n[\\s\\S]*?runs-on:\\s*ubuntu-24\\.04\\s*\\n\\s+timeout-minutes:\\s*30\\s*\\n/);
});
