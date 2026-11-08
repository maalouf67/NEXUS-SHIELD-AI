import { Router } from 'express';

import { requireAuth, requireRole } from '../auth/auth.middleware.js';
import {
  buildUserMigrationPreview,
  validateUserMigrationPreviewRequest
} from './preview.js';

export function createUserMigrationRouter() {
  const router = Router();

  router.post('/user-migration/preview', requireAuth, requireRole('admin'), (req, res) => {
    const parsed = validateUserMigrationPreviewRequest(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'INVALID_PREVIEW_REQUEST' });
    }

    try {
      const preview = buildUserMigrationPreview(parsed.data);
      return res.status(200).json(preview);
    } catch {
      return res.status(400).json({ error: 'INVALID_PREVIEW_REQUEST' });
    }
  });

  return router;
}

export const userMigrationRouter = createUserMigrationRouter();
