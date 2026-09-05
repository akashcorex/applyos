/**
 * Railpack looks at the repo-root package.json for a start script.
 * Railway injects RAILWAY_SERVICE_NAME so one root script can dispatch.
 */
import { spawn } from 'node:child_process';

const port = process.env.PORT;
const name = process.env.RAILWAY_SERVICE_NAME ?? '';

const commands = {
  '@applyso/api': ['sh', '/app/apps/api/scripts/start.sh'],
  api: ['sh', '/app/apps/api/scripts/start.sh'],
  '@applyso/web': ['node', 'apps/web/server.js'],
  web: ['node', 'apps/web/server.js'],
  'apply-agent': [
    'python',
    '-m',
    'uvicorn',
    'app.main:app',
    '--host',
    '0.0.0.0',
    '--port',
    port || '8003',
  ],
  'job-agent': [
    'uvicorn',
    'main:app',
    '--host',
    '0.0.0.0',
    '--port',
    port || '8002',
  ],
  'outreach-agent': [
    'uvicorn',
    'main:app',
    '--host',
    '0.0.0.0',
    '--port',
    port || '8004',
  ],
  'ai-orchestrator': [
    'uvicorn',
    'main:app',
    '--host',
    '0.0.0.0',
    '--port',
    port || '8001',
  ],
  'resume-agent': [
    'uvicorn',
    'main:app',
    '--host',
    '0.0.0.0',
    '--port',
    port || '8005',
  ],
};

const command = commands[name];
if (!command) {
  console.error(
    `No Railway start mapping for RAILWAY_SERVICE_NAME=${JSON.stringify(name)}`,
  );
  process.exit(1);
}

const child = spawn(command[0], command.slice(1), { stdio: 'inherit' });
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
