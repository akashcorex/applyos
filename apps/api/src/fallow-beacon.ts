import { resolve } from 'node:path';

import { config } from 'dotenv';

const DEFAULT_PROJECT_ID = 'akashcorex/outreach-autometer';
const DEFAULT_ENDPOINT = 'https://api.fallow.cloud';

type RuntimeMismatchDetail = {
  message: string;
};

function resolveProjectId(): string {
  return process.env.FALLOW_PROJECT_ID || DEFAULT_PROJECT_ID;
}

function resolveEndpoint(): string {
  return process.env.FALLOW_BEACON_ENDPOINT || DEFAULT_ENDPOINT;
}

function resolveCommitSha(): string | undefined {
  return process.env.GIT_SHA || process.env.GITHUB_SHA;
}

export async function startFallowBeacon(): Promise<void> {
  config({ path: resolve(process.cwd(), '.env') });

  const apiKey = process.env.BEACON_API_KEY;
  if (!apiKey) {
    return;
  }

  const { createNodeBeacon } = await import('@fallow-cli/beacon');

  const beacon = createNodeBeacon({
    apiKey,
    projectId: resolveProjectId(),
    endpoint: resolveEndpoint(),
    commitSha: resolveCommitSha(),
    onRuntimeMismatch: (detail: RuntimeMismatchDetail) => {
      console.warn(
        '[fallow] beacon cannot capture coverage:',
        detail.message,
        '(set NODE_V8_COVERAGE before starting Node)',
      );
    },
  });

  beacon.start();
  console.log('[fallow] runtime coverage beacon started');
}
