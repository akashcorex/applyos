import '@applyso/validation/compile';
import 'dotenv/config';

import { toNodeHandler } from 'better-auth/node';
import cors from 'cors';
import express from 'express';

import { auth } from './auth';
import { startFallowBeacon } from './fallow-beacon';
import { adminRouter } from './routes/admin';
import { applicationsRouter } from './routes/applications';
import { earlyAccessRouter } from './routes/early-access';
import { linkedinConnectsRouter } from './routes/linkedin-connects';
import { meRouter } from './routes/me';
import { outreachRouter } from './routes/outreach';
import { preferencesRouter } from './routes/preferences';
import { profilesRouter } from './routes/profiles';
import { resumesInternalRouter, resumesRouter } from './routes/resumes';
import { workflowsRouter } from './routes/workflows';

const host = process.env.HOST ?? '0.0.0.0';
const port = process.env.PORT ? Number(process.env.PORT) : 5000;
const webUrl = process.env.WEB_URL ?? 'http://localhost:3000';

const app = express();

app.use(
  cors({
    origin: webUrl,
    credentials: true,
  }),
);

app.all('/api/auth/*', toNodeHandler(auth));

app.use(express.json());

app.get('/', (_req, res) => {
  res.send({ message: 'Hello API' });
});

app.use('/v1/early-access', earlyAccessRouter);
app.use('/v1/me', meRouter);
app.use('/v1/profiles', profilesRouter);
app.use('/v1/resumes', resumesInternalRouter);
app.use('/v1/resumes', resumesRouter);
app.use('/v1/admin', adminRouter);
app.use('/v1/applications', applicationsRouter);
app.use('/v1/linkedin-connects', linkedinConnectsRouter);
app.use('/v1/preferences', preferencesRouter);
app.use('/v1/outreach', outreachRouter);
app.use('/v1/workflows', workflowsRouter);

app.listen(port, host, () => {
  console.log(`[ ready ] http://${host}:${port}`);
  void startFallowBeacon();
});
