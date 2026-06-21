import 'dotenv/config';

import { toNodeHandler } from 'better-auth/node';
import cors from 'cors';
import express from 'express';

import { auth } from './auth';
import { startFallowBeacon } from './fallow-beacon';

const host = process.env.HOST ?? 'localhost';
const port = process.env.PORT ? Number(process.env.PORT) : 3333;
const webUrl = process.env.WEB_URL ?? 'http://localhost:3000';

const app = express();

app.use(
  cors({
    origin: webUrl,
    credentials: true,
  }),
);

app.all('/api/auth/*', toNodeHandler(auth));

app.get('/', (_req, res) => {
  res.send({ message: 'Hello API' });
});

app.listen(port, host, () => {
  console.log(`[ ready ] http://${host}:${port}`);
  void startFallowBeacon();
});
