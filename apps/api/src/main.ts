import '@applyso/validation/compile';
import 'dotenv/config';

import cors from 'cors';
import express from 'express';

import { auth } from './auth';
import { startFallowBeacon } from './fallow-beacon';
import { betterAuthExpressHandler } from './lib/better-auth-express';
import { reconcileJobs } from './lib/job-reconcile';
import {
  authCookieConfigError,
  webLoginUrl,
  webOrigins,
} from './lib/web-origins';
import { adminRouter } from './routes/admin';
import { applicationsRouter } from './routes/applications';
import { billingRouter, billingWebhookHandler } from './routes/billing';
import { linkedinConnectsRouter } from './routes/linkedin-connects';
import { jobsInternalRouter, jobsRouter } from './routes/jobs';
import { meRouter } from './routes/me';
import { preferencesRouter } from './routes/preferences';
import { profilesRouter } from './routes/profiles';
import { resumesInternalRouter, resumesRouter } from './routes/resumes';
import { workflowsRouter } from './routes/workflows';

const host = process.env.HOST ?? '0.0.0.0';
const port = process.env.PORT ? Number(process.env.PORT) : 5000;

const app = express();
app.set('trust proxy', 1);

app.use(
  cors({
    origin: webOrigins(),
    credentials: true,
  }),
);

app.all('/api/auth/*', betterAuthExpressHandler(auth));

app.post(
  '/v1/billing/webhook',
  express.raw({ type: 'application/json' }),
  (req, res, next) => {
    void billingWebhookHandler(req, res).catch(next);
  },
);

app.use(express.json());

app.get('/', (req, res) => {
  const error = typeof req.query.error === 'string' ? req.query.error : null;
  if (error) {
    const next = new URL(webLoginUrl());
    next.searchParams.set('error', error);
    res.redirect(302, next.toString());
    return;
  }
  res.send({ message: 'Hello API' });
});

app.use('/v1/me', meRouter);
app.use('/v1/profiles', profilesRouter);
app.use('/v1/resumes', resumesInternalRouter);
app.use('/v1/resumes', resumesRouter);
app.use('/v1/admin', adminRouter);
app.use('/v1/applications', applicationsRouter);
app.use('/v1/linkedin-connects', linkedinConnectsRouter);
app.use('/v1/jobs', jobsInternalRouter);
app.use('/v1/jobs', jobsRouter);
app.use('/v1/preferences', preferencesRouter);
app.use('/v1/workflows', workflowsRouter);
app.use('/v1/billing', billingRouter);

if (process.env.NODE_ENV === 'production') {
  const cookieError = authCookieConfigError();
  if (cookieError) {
    console.error(`[api] ${cookieError}`);
  }
}

process.on('unhandledRejection', (reason) => {
  console.error('[api] unhandledRejection', reason);
});

// Hourly reconciler: close listings that left every board (single-instance).
setTimeout(
  () => {
    const run = () => {
      reconcileJobs()
        .then((result) => console.warn('[jobs] reconcile done:', result))
        .catch((error) => console.error('[jobs] reconcile failed:', error));
    };
    run();
    setInterval(run, 60 * 60 * 1000);
  },
  10 * 60 * 1000,
);

app.listen(port, host, () => {
  console.log(`[ ready ] http://${host}:${port}`);
  void startFallowBeacon();
});
