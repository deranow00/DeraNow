import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import cors from 'cors';
import securityHeaders from './middlewares/securityHeaders.js';
import requestLogger from './middlewares/requestLogger.js';
import { createRateLimiter } from './middlewares/rateLimit.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandlers.js';
import { validateEnvOrExit } from './config/validateEnv.js';

import authRoutes from './routes/authRoutes.js';
import adminRoutes from './routes/adminRoutes.js';

dotenv.config();
validateEnvOrExit();
const app = express();

const DEFAULT_ADMIN_ORIGIN = 'http://localhost:5174';
const configuredOrigins = process.env.CORS_ORIGINS || process.env.ADMIN_FRONTEND_URL || '';
const allowedOrigins = (configuredOrigins || DEFAULT_ADMIN_ORIGIN)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)
  .map((origin) => origin.replace(/\/+$/, ''));
const allowAllOrigins = !configuredOrigins || allowedOrigins.includes('*');

app.disable('x-powered-by');
app.use(securityHeaders);
app.use(requestLogger);
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowAllOrigins) return callback(null, true);
      const normalized = origin.replace(/\/+$/, '');
      if (allowedOrigins.includes(normalized)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
  })
);
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '1mb' }));
app.use(express.urlencoded({ extended: false, limit: process.env.JSON_BODY_LIMIT || '1mb' }));

app.use(
  createRateLimiter({
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000),
    max: Number(process.env.RATE_LIMIT_MAX || 240),
    keyPrefix: 'admin-global',
  })
);
app.use(
  '/api/admin/auth',
  createRateLimiter({
    windowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 60_000),
    max: Number(process.env.AUTH_RATE_LIMIT_MAX || 20),
    keyPrefix: 'admin-auth',
  })
);

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log("Connected to DB"))
    .catch(err => console.log(err));

app.use('/api/admin/auth', authRoutes);
app.use('/api/admin', adminRoutes);

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'property-rental-admin-backend', at: new Date().toISOString() });
});

app.get('/ready', (_req, res) => {
  res.json({ ok: true, ready: true });
});

app.use(notFoundHandler);
app.use(errorHandler);

const PORT = process.env.PORT || 8001;
app.listen(PORT, () => console.log(`Admin backend running on port ${PORT}`));
