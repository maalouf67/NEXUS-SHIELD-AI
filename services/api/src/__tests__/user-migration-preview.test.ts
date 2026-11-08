import { describe, expect, it } from 'vitest';

import {
  buildUserMigrationPreview,
  validateUserMigrationPreviewRequest
} from '../user-migration/preview.js';

const validRecord = {
  sourceSubjectId: 'synthetic-user-001',
  email: 'synthetic-001@example.test',
  sourceRole: 'member',
  accountStatus: 'enabled',
  lastLoginAt: '2026-10-01T10:00:00Z'
};

describe('secure user migration preview', () => {
  it('creates an aggregate preview without persistence or source calls', () => {
    const preview = buildUserMigrationPreview({
      sourceSystemCode: 'synthetic-test',
      schemaVersion: '1',
      records: [validRecord]
    });

    expect(preview.previewOnly).toBe(true);
    expect(preview.dataPersisted).toBe(false);
    expect(preview.usersCreated).toBe(0);
    expect(preview.sourceSystemContacted).toBe(false);
    expect(preview.sourceAccountsModified).toBe(false);
    expect(preview.totals).toEqual({
      received: 1,
      valid: 1,
      conflicts: 0,
      rejected: 0
    });
    expect(JSON.stringify(preview)).not.toContain(validRecord.email);
    expect(JSON.stringify(preview)).not.toContain(validRecord.sourceSubjectId);
  });

  it('rejects credential, token, MFA, and session fields without echoing values', () => {
    for (const prohibitedField of ['password', 'passwordHash', 'accessToken', 'mfaSeed', 'sessionId']) {
      const preview = buildUserMigrationPreview({
        sourceSystemCode: 'synthetic-test',
        schemaVersion: '1',
        records: [{ ...validRecord, [prohibitedField]: 'DO-NOT-LEAK-THIS' }]
      });
      expect(preview.totals.rejected).toBe(1);
      expect(preview.records[0].issueCodes).toContain('PROHIBITED_FIELD_PRESENT');
      expect(JSON.stringify(preview)).not.toContain('DO-NOT-LEAK-THIS');
    }
  });

  it('rejects unknown record fields and does not echo submitted values', () => {
    const preview = buildUserMigrationPreview({
      sourceSystemCode: 'synthetic-test',
      schemaVersion: '1',
      records: [{ ...validRecord, nationalId: 'SENSITIVE-VALUE' }]
    });
    expect(preview.totals.rejected).toBe(1);
    expect(preview.records[0].issueCodes).toContain('INVALID_RECORD');
    expect(JSON.stringify(preview)).not.toContain('SENSITIVE-VALUE');
  });

  it('marks all repeated external subject identifiers as conflicts', () => {
    const preview = buildUserMigrationPreview({
      sourceSystemCode: 'synthetic-test',
      schemaVersion: '1',
      records: [
        validRecord,
        { ...validRecord, email: 'other@example.test' }
      ]
    });
    expect(preview.totals.conflicts).toBe(2);
    expect(preview.records.map((record) => record.status)).toEqual(['conflict', 'conflict']);
  });

  it('marks all repeated normalized email addresses as conflicts', () => {
    const preview = buildUserMigrationPreview({
      sourceSystemCode: 'synthetic-test',
      schemaVersion: '1',
      records: [
        validRecord,
        { ...validRecord, sourceSubjectId: 'synthetic-user-002', email: 'SYNTHETIC-001@example.test' }
      ]
    });
    expect(preview.totals.conflicts).toBe(2);
  });

  it('never maps an administrator or unknown source role to a NEXUS administrator', () => {
    const preview = buildUserMigrationPreview({
      sourceSystemCode: 'synthetic-test',
      schemaVersion: '1',
      records: [
        { ...validRecord, sourceRole: 'administrator' },
        { ...validRecord, sourceSubjectId: 'synthetic-user-002', email: 'other@example.test', sourceRole: 'unknown' }
      ]
    });
    expect(preview.records.map((record) => record.proposedTargetRole)).toEqual([null, null]);
    expect(preview.records.every((record) => record.issueCodes.includes('PRIVILEGED_ROLE_REVIEW'))).toBe(true);
  });

  it('maps only explicitly allowed low-privilege roles', () => {
    const preview = buildUserMigrationPreview({
      sourceSystemCode: 'synthetic-test',
      schemaVersion: '1',
      records: [
        validRecord,
        { ...validRecord, sourceSubjectId: 'synthetic-user-002', email: 'other@example.test', sourceRole: 'analyst' }
      ]
    });
    expect(preview.records.map((record) => record.proposedTargetRole)).toEqual(['viewer', 'analyst']);
  });

  it('rejects malformed top-level request structures', () => {
    expect(validateUserMigrationPreviewRequest({
      sourceSystemCode: 'synthetic-test',
      schemaVersion: '1',
      records: [],
      executeImport: true
    }).success).toBe(false);
  });

  it('limits previews to 250 records', () => {
    expect(validateUserMigrationPreviewRequest({
      sourceSystemCode: 'synthetic-test',
      schemaVersion: '1',
      records: Array.from({ length: 251 }, (_, index) => ({
        ...validRecord,
        sourceSubjectId: `synthetic-${index}`,
        email: `synthetic-${index}@example.test`
      }))
    }).success).toBe(false);
  });

  it('distinguishes source account status from target authentication state', () => {
    const preview = buildUserMigrationPreview({
      sourceSystemCode: 'synthetic-test',
      schemaVersion: '1',
      records: [{ ...validRecord, accountStatus: 'disabled' }]
    });
    expect(preview.records[0].sourceAccountStatus).toBe('disabled');
    expect(preview).not.toHaveProperty('targetAccountActive');
    expect(preview.usersCreated).toBe(0);
  });
});
