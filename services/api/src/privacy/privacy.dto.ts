import { z } from 'zod';

export const privacyDataCategory = z.enum([
  'device',
  'network',
  'application',
  'identity',
  'document',
  'metadata'
]);

export const PrivacyConsentSchema = z
  .object({
    granted: z.boolean(),
    explicit: z.boolean(),
    purpose: z.enum(['security_review', 'privacy_review', 'compliance_review']),
    data_categories: z.array(privacyDataCategory).min(1).max(10),
    timestamp: z.string().datetime().optional(),
    source: z.enum(['dashboard', 'api', 'manual']).default('dashboard')
  })
  .refine((consent) => consent.granted === true && consent.explicit === true, {
    message: 'Explicit consent is required',
    path: ['explicit']
  });

export const PrivacyScanPayloadSchema = z
  .object({
    summary: z.string().trim().max(250).optional(),
    data_classes: z.array(privacyDataCategory).max(10).default([]),
    notes: z.string().trim().max(500).optional(),
    metadata: z
      .object({
        environment: z.enum(['development', 'test', 'production']).optional(),
        region: z.string().trim().max(64).optional()
      })
      .strict()
      .optional()
  })
  .strict();

export const PrivacyScanRequestSchema = z.object({
  request_id: z.string().trim().min(1).max(64).optional(),
  consent: PrivacyConsentSchema,
  payload: PrivacyScanPayloadSchema
});

export type PrivacyDataCategory = z.infer<typeof privacyDataCategory>;
export type PrivacyConsent = z.infer<typeof PrivacyConsentSchema>;
export type PrivacyScanPayload = z.infer<typeof PrivacyScanPayloadSchema>;
export type PrivacyScanRequest = z.infer<typeof PrivacyScanRequestSchema>;
