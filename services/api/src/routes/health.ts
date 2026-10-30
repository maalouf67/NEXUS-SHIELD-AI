import { Router } from 'express';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  res.json({
    service: 'nexus-shield-api',
    ok: true,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});
