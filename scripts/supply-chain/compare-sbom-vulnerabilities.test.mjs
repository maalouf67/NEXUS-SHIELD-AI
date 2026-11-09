import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectFindings, compareFindings, makeIdentity } from './compare-sbom-vulnerabilities.mjs';

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

test('detects severity escalation on an unchanged package and vulnerability', () => {
  const previous = {
    target: 'ai',
    vulnerabilityId: 'CVE-2026-1005',
    packageName: 'fastapi',
    purl: 'pkg:pypi/fastapi@1.0.0',
    installedVersion: '1.0.0',
    severity: 'MEDIUM'
  };
  const current = {
    ...previous,
    severity: 'HIGH',
    identity: makeIdentity(previous)
  };
  const result = compareFindings([current], [previous]);
  assert.equal(result.existing.length, 1);
  assert.equal(result.escalated.length, 1);
  assert.equal(result.escalated[0].severity, 'HIGH');
});

test('normalizes and deduplicates Trivy findings from each of the four SBOM reports', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-sbom-vulns-'));
  try {
    for (const target of ['source', 'postgres', 'ai', 'clamav']) {
      const finding = {
        VulnerabilityID: 'CVE-2026-2001',
        PkgName: 'openssl',
        PkgIdentifier: { PURL: 'pkg:deb/debian/openssl@3.0.0' },
        InstalledVersion: '3.0.0',
        FixedVersion: '3.0.1',
        Severity: 'HIGH',
        PrimaryURL: 'https://example.test/CVE-2026-2001'
      };
      fs.writeFileSync(path.join(directory, target + '.json'), JSON.stringify({
        Results: [{
          Target: target,
          Type: 'debian',
          Vulnerabilities: [finding, finding]
        }]
      }));
    }

    const result = collectFindings(directory);
    assert.equal(result.findings.length, 4);
    assert.equal(result.summaries.length, 4);
    assert.equal(result.findings[0].packageName, 'openssl');
    assert.equal(result.findings[0].purl, 'pkg:deb/debian/openssl@3.0.0');
    assert.equal(result.findings[0].fixedVersion, '3.0.1');
    assert.equal(result.summaries.find(item => item.id === 'postgres').occurrences, 2);
    assert.equal(result.summaries.find(item => item.id === 'postgres').uniqueFindings, 1);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
