import test from 'node:test';
import assert from 'node:assert/strict';
import { compareFindings, makeIdentity } from './compare-sbom-vulnerabilities.mjs';

test('identifies new, existing and resolved findings by target, CVE, package and version', () => {
  const existing = {
    target: 'ai',
    vulnerabilityId: 'CVE-2026-1000',
    packageName: 'fastapi',
    purl: 'pkg:pypi/fastapi@1.0.0',
    installedVersion: '1.0.0'
  };
  const current = [
    { ...existing, identity: makeIdentity(existing) },
    {
      target: 'ai',
      vulnerabilityId: 'CVE-2026-1001',
      packageName: 'uvicorn',
      purl: 'pkg:pypi/uvicorn@1.0.0',
      installedVersion: '1.0.0'
    }
  ];
  const baseline = [
    { ...existing, identity: makeIdentity(existing) },
    {
      target: 'postgres',
      vulnerabilityId: 'CVE-2026-1002',
      packageName: 'libpq5',
      purl: 'pkg:deb/debian/libpq5@1.0.0',
      installedVersion: '1.0.0'
    }
  ];
  const result = compareFindings(current, baseline);
  assert.equal(result.existing.length, 1);
  assert.equal(result.introduced.length, 1);
  assert.equal(result.resolved.length, 1);
  assert.equal(result.introduced[0].vulnerabilityId, 'CVE-2026-1001');
});

test('keeps the same vulnerability separate across SBOM targets', () => {
  const base = {
    vulnerabilityId: 'CVE-2026-1003',
    packageName: 'openssl',
    purl: 'pkg:deb/debian/openssl@3.0.0',
    installedVersion: '3.0.0'
  };
  assert.notEqual(
    makeIdentity({ ...base, target: 'postgres' }),
    makeIdentity({ ...base, target: 'ai' })
  );
});

test('uses package name if package URL is absent', () => {
  assert.match(makeIdentity({
    target: 'source',
    vulnerabilityId: 'CVE-2026-1004',
    packageName: 'lodash',
    installedVersion: '4.17.0'
  }), /lodash/);
});
