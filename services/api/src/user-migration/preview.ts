import { z } from 'zod';

// This foundation is intentionally restricted to synthetic fixtures. A real
// source-system identifier is not accepted by the preview endpoint.
const SourceSystemCodeSchema = z.literal('synthetic-test');

const ImportRecordSchema = z.object({
  sourceSubjectId: z.string()
    .trim()
    .min(1)
    .max(128)
    .refine((value) => !/[\u0000-\u001f\u007f]/.test(value)),
  email: z.string().trim().email().max(254).optional(),
  sourceRole: z.enum(['member', 'analyst', 'administrator', 'unknown']),
  accountStatus: z.enum(['enabled', 'disabled', 'locked', 'unknown']).optional(),
  lastLoginAt: z.string().datetime({ offset: true }).optional()
}).strict();

const PreviewRequestSchema = z.object({
  sourceSystemCode: SourceSystemCodeSchema,
  schemaVersion: z.string().trim().min(1).max(32),
  records: z.array(z.unknown()).min(1).max(250)
}).strict();

const PROHIBITED_FIELD = /password|passwd|credential|secret|token|cookie|session|mfa|totp|recovery|private.?key|access.?key|national.?id/i;

type ParsedImportRecord = z.infer<typeof ImportRecordSchema>;

export type PreviewIssueCode =
  | 'INVALID_RECORD'
  | 'PROHIBITED_FIELD_PRESENT'
  | 'DUPLICATE_SOURCE_SUBJECT'
  | 'DUPLICATE_EMAIL'
  | 'PRIVILEGED_ROLE_REVIEW';

export interface PreviewRecordResult {
  recordIndex: number;
  status: 'valid' | 'conflict' | 'rejected';
  issueCodes: PreviewIssueCode[];
  proposedTargetRole: 'viewer' | 'analyst' | null;
  sourceAccountStatus: 'enabled' | 'disabled' | 'locked' | 'unknown';
  existingLocalAccountCheck: 'not_performed';
}

export interface UserMigrationPreview {
  previewOnly: true;
  dataPersisted: false;
  usersCreated: 0;
  sourceSystemContacted: false;
  sourceAccountsModified: false;
  sourceSystemCode: string;
  schemaVersion: string;
  totals: {
    received: number;
    valid: number;
    conflicts: number;
    rejected: number;
  };
  records: PreviewRecordResult[];
}

function hasProhibitedField(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return Object.keys(value).some((key) => PROHIBITED_FIELD.test(key));
}

function duplicateValues(values: Array<string | undefined>): Set<string> {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (value === undefined) continue;
    const normalized = value.trim().toLowerCase();
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }
  return new Set([...counts].filter(([, count]) => count > 1).map(([value]) => value));
}

/**
 * Pure, in-memory preview. It deliberately has no repository or filesystem
 * dependency and never creates accounts, sessions, audit rows, or source calls.
 */
export function buildUserMigrationPreview(input: unknown): UserMigrationPreview {
  const request = PreviewRequestSchema.parse(input);

  const parsedRecords: Array<ParsedImportRecord | null> = request.records.map((record) => {
    if (hasProhibitedField(record)) return null;
    const parsed = ImportRecordSchema.safeParse(record);
    return parsed.success ? parsed.data : null;
  });

  const validRecords = parsedRecords.filter(
    (record): record is ParsedImportRecord => record !== null
  );
  const duplicateSubjects = duplicateValues(validRecords.map((record) => record.sourceSubjectId));
  const duplicateEmails = duplicateValues(validRecords.map((record) => record.email));

  const records: PreviewRecordResult[] = parsedRecords.map((record, recordIndex) => {
    const raw = request.records[recordIndex];
    if (hasProhibitedField(raw)) {
      return {
        recordIndex,
        status: 'rejected',
        issueCodes: ['PROHIBITED_FIELD_PRESENT'],
        proposedTargetRole: null,
        sourceAccountStatus: 'unknown',
        existingLocalAccountCheck: 'not_performed'
      };
    }

    if (!record) {
      return {
        recordIndex,
        status: 'rejected',
        issueCodes: ['INVALID_RECORD'],
        proposedTargetRole: null,
        sourceAccountStatus: 'unknown',
        existingLocalAccountCheck: 'not_performed'
      };
    }

    const issueCodes: PreviewIssueCode[] = [];
    if (duplicateSubjects.has(record.sourceSubjectId.trim().toLowerCase())) {
      issueCodes.push('DUPLICATE_SOURCE_SUBJECT');
    }
    if (record.email && duplicateEmails.has(record.email.trim().toLowerCase())) {
      issueCodes.push('DUPLICATE_EMAIL');
    }
    if (record.sourceRole === 'administrator' || record.sourceRole === 'unknown') {
      issueCodes.push('PRIVILEGED_ROLE_REVIEW');
    }

    const isConflict = issueCodes.includes('DUPLICATE_SOURCE_SUBJECT') ||
      issueCodes.includes('DUPLICATE_EMAIL');
    return {
      recordIndex,
      status: isConflict ? 'conflict' : 'valid',
      issueCodes,
      proposedTargetRole: record.sourceRole === 'member'
        ? 'viewer'
        : record.sourceRole === 'analyst'
          ? 'analyst'
          : null,
      sourceAccountStatus: record.accountStatus ?? 'unknown',
      existingLocalAccountCheck: 'not_performed'
    };
  });

  return {
    previewOnly: true,
    dataPersisted: false,
    usersCreated: 0,
    sourceSystemContacted: false,
    sourceAccountsModified: false,
    sourceSystemCode: request.sourceSystemCode,
    schemaVersion: request.schemaVersion,
    totals: {
      received: records.length,
      valid: records.filter((record) => record.status === 'valid').length,
      conflicts: records.filter((record) => record.status === 'conflict').length,
      rejected: records.filter((record) => record.status === 'rejected').length
    },
    records
  };
}

export function validateUserMigrationPreviewRequest(input: unknown) {
  return PreviewRequestSchema.safeParse(input);
}
