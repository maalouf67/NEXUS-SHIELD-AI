import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const TARGETS = [
  ['source', 'source.json', 'Repository source'],
  ['postgres', 'postgres.json', 'PostgreSQL image'],
  ['ai', 'ai.json', 'AI image'],
  ['clamav', 'clamav.json', 'ClamAV image']
];
const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'];
const BLOCKING = new Set(['CRITICAL', 'HIGH']);

export function makeIdentity(item) {
  return JSON.stringify([
    item.target,
    item.vulnerabilityId,
    item.purl || item.packageName,
    item.installedVersion
  ]);
}

export function compareFindings(current, baseline) {
  const oldById = new Map(
    baseline.map(item => [item.identity || makeIdentity(item), item])
  );
  const newIds = new Set(current.map(item => item.identity || makeIdentity(item)));
  const introduced = current.filter(item => !oldById.has(item.identity || makeIdentity(item)));
  const existing = current.filter(item => oldById.has(item.identity || makeIdentity(item)));
  const resolved = baseline.filter(item => !newIds.has(item.identity || makeIdentity(item)));
  const escalated = current.filter(item => {
    const previous = oldById.get(item.identity || makeIdentity(item));
    if (!previous) return false;
    return SEVERITIES.indexOf(item.severity) < SEVERITIES.indexOf(previous.severity);
  });
  return { introduced, existing, resolved, escalated };
}

export function collectFindings(reportDirectory) {
  const all = new Map();
  const summaries = [];

  for (const [target, filename, label] of TARGETS) {
    const reportPath = path.join(reportDirectory, filename);
    if (!fs.existsSync(reportPath)) throw new Error('Missing Trivy SBOM report: ' + filename);
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    if (!report || !Array.isArray(report.Results)) throw new Error('Invalid Trivy JSON report: ' + filename);

    let occurrences = 0;
    for (const result of report.Results) {
      if (result.Vulnerabilities != null && !Array.isArray(result.Vulnerabilities)) {
        throw new Error('Invalid vulnerability list in ' + filename);
      }
      for (const raw of result.Vulnerabilities || []) {
        const identifier = raw.PkgIdentifier && typeof raw.PkgIdentifier === 'object'
          ? raw.PkgIdentifier : {};
        const severityText = String(raw.Severity || 'UNKNOWN').toUpperCase();
        const item = {
          target,
          packageType: result.Type || null,
          packageName: raw.PkgName || 'unknown-package',
          purl: identifier.PURL || identifier.purl || null,
          installedVersion: raw.InstalledVersion || 'unknown-version',
          vulnerabilityId: raw.VulnerabilityID || 'UNKNOWN-ID',
          severity: SEVERITIES.includes(severityText) ? severityText : 'UNKNOWN',
          fixedVersion: raw.FixedVersion || null,
          primaryUrl: raw.PrimaryURL || null,
          dataSource: raw.DataSource?.Name || null,
          publishedDate: raw.PublishedDate || null,
          lastModifiedDate: raw.LastModifiedDate || null
        };
        item.identity = makeIdentity(item);
        all.set(item.identity, item);
        occurrences += 1;
      }
    }
    summaries.push({ id: target, label, occurrences });
  }

  const findings = [...all.values()].sort((a, b) =>
    a.target.localeCompare(b.target) ||
    SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) ||
    a.vulnerabilityId.localeCompare(b.vulnerabilityId) ||
    a.packageName.localeCompare(b.packageName)
  );

  for (const summary of summaries) {
    const targetFindings = findings.filter(item => item.target === summary.id);
    summary.uniqueFindings = targetFindings.length;
    summary.bySeverity = Object.fromEntries(
      SEVERITIES.map(severity => [
        severity,
        targetFindings.filter(item => item.severity === severity).length
      ])
    );
  }
  return { findings, summaries };
}

function main() {
  const reportDirectory = process.env.NEXUS_VULN_REPORT_DIR;
  const baselinePath = process.env.NEXUS_VULN_BASELINE_FILE;
  if (!reportDirectory || !baselinePath) throw new Error('Report and baseline paths are required');

  const collected = collectFindings(reportDirectory);
  const current = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceCommit: process.env.GITHUB_SHA || 'unknown',
    scanner: { name: 'Trivy', version: '0.76.2' },
    targets: collected.summaries,
    findings: collected.findings
  };

  let baseline = null;
  let baselineStatus = 'unavailable';
  let delta = { introduced: [], existing: [], resolved: [], escalated: [] };
  if (fs.existsSync(baselinePath)) {
    baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    if (baseline.schemaVersion !== 1 || !Array.isArray(baseline.findings)) {
      throw new Error('Unsupported SBOM vulnerability baseline schema');
    }
    baselineStatus = 'available';
    delta = compareFindings(current.findings, baseline.findings);
  }

  const blocking = [
    ...delta.introduced.filter(item => BLOCKING.has(item.severity)),
    ...delta.escalated.filter(item => BLOCKING.has(item.severity))
  ];
  const counts = Object.fromEntries(
    SEVERITIES.map(severity => [
      severity,
      delta.introduced.filter(item => item.severity === severity).length
    ])
  );
  const output = {
    ...current,
    comparison: {
      baselineStatus,
      baselineCommit: baseline?.sourceCommit || null,
      introduced: delta.introduced.length,
      existing: delta.existing.length,
      resolved: delta.resolved.length,
      escalated: delta.escalated.length,
      introducedBySeverity: counts,
      newHighOrCritical: blocking.length
    }
  };

  fs.writeFileSync(
    path.join(reportDirectory, 'nexus-vulnerability-report.json'),
    JSON.stringify(output, null, 2) + '\n'
  );

  const lines = [
    '## SBOM vulnerability intelligence',
    '',
    '- Scanner: Trivy 0.76.1',
    '- Source commit: ' + current.sourceCommit,
    '- Total unique findings: **' + current.findings.length + '**',
    '',
    '| SBOM target | Total | Critical | High | Medium | Low | Unknown |',
    '|---|---:|---:|---:|---:|---:|---:|'
  ];
  for (const target of current.targets) {
    const c = target.bySeverity;
    lines.push('| ' + target.label + ' | ' + target.uniqueFindings + ' | ' +
      c.CRITICAL + ' | ' + c.HIGH + ' | ' + c.MEDIUM + ' | ' + c.LOW + ' | ' + c.UNKNOWN + ' |');
  }
  lines.push('');
  if (baselineStatus === 'unavailable') {
    lines.push('Baseline: **not available**. Findings are unbaselined, not labelled as new. The first successful main-branch run initializes the baseline.');
  } else {
    lines.push('Baseline commit: ' + (baseline.sourceCommit || 'unknown'));
    lines.push('- New: **' + delta.introduced.length + '**');
    lines.push('- Existing: ' + delta.existing.length);
    lines.push('- Resolved: ' + delta.resolved.length);
    lines.push('- Severity escalations: ' + delta.escalated.length);
  }
  if (blocking.length) {
    lines.push('');
    lines.push('**Gate failed:** new HIGH/CRITICAL findings require remediation or reviewed risk acceptance. The main baseline was not updated.');
    for (const item of blocking.slice(0, 20)) {
      console.error('::error::New ' + item.severity + ': ' + item.vulnerabilityId +
        ' in ' + item.packageName + '@' + item.installedVersion + ' (' + item.target + ')');
    }
  } else if (baselineStatus === 'available') {
    lines.push('');
    lines.push('No newly introduced or severity-escalated HIGH/CRITICAL finding was detected.');
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
  }

  let baselineWritten = false;
  const onMain = process.env.GITHUB_REF === 'refs/heads/main';
  if (onMain && (baselineStatus === 'unavailable' || blocking.length === 0)) {
    fs.writeFileSync(
      baselinePath,
      JSON.stringify({ ...current, baselineCreatedAt: new Date().toISOString() }, null, 2) + '\n'
    );
    baselineWritten = true;
  }

  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, 'baseline_status=' + baselineStatus + '\n');
    fs.appendFileSync(process.env.GITHUB_OUTPUT, 'baseline_written=' + baselineWritten + '\n');
    fs.appendFileSync(process.env.GITHUB_OUTPUT, 'new_high_critical=' + blocking.length + '\n');
  }
  if (blocking.length) process.exitCode = 1;
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invoked && fileURLToPath(import.meta.url) === invoked) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 2;
  }
}
