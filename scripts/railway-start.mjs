/**
 * Railpack looks at the repo-root package.json for a start script.
 * Railway injects RAILWAY_SERVICE_NAME so one root script can dispatch.
 */
import { spawn } from 'node:child_process';

const port = process.env.PORT;
const name = process.env.RAILWAY_SERVICE_NAME ?? '';

const commands = {
  '@applyso/api': ['node', 'apps/api/dist/main.js'],
  api: ['node', 'apps/api/dist/main.js'],
  '@applyso/web': ['bun', '--filter', '@applyso/web', 'start'],
  web: ['bun', '--filter', '@applyso/web', 'start'],
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
    'uv',
    'run',
    'uvicorn',
    'main:app',
    '--host',
    '0.0.0.0',
    '--port',
    port || '8002',
  ],
  'outreach-agent': [
    'uv',
    'run',
    'uvicorn',
    'main:app',
    '--host',
    '0.0.0.0',
    '--port',
    port || '8004',
  ],
  'ai-orchestrator': [
    'uv',
    'run',
    'uvicorn',
    'main:app',
    '--host',
    '0.0.0.0',
    '--port',
    port || '8001',
  ],
  'resume-agent': [
    'uv',
    'run',
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
