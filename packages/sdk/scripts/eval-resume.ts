import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import {
  evalCaseSchema,
  evalScoreSchema,
  type EvalCase,
  type EvalScore,
} from '@applyso/validation/evals';

import { jevCheck } from '../src/jev.js';
import {
  buildResumeEvalState,
  normalizeResumeEvalResult,
  resumePromptHash,
  resumeQuestions,
} from '../src/evals/resume.js';

const goldenDir = fileURLToPath(
  new URL('../../../tests/evals/golden/resume', import.meta.url),
);

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined;
}

function scoreMatches(expected: EvalScore, actual: EvalScore): boolean {
  return (
    expected.no_new_facts === actual.no_new_facts &&
    expected.evidence_ids_valid === actual.evidence_ids_valid &&
    expected.operation_allowed === actual.operation_allowed &&
    Math.abs(expected.skills_relevant - actual.skills_relevant) <= 10
  );
}

async function loadCases(): Promise<EvalCase[]> {
  const files = (await readdir(goldenDir))
    .filter((file) => file.endsWith('.json'))
    .sort();

  return Promise.all(
    files.map(async (file) => {
      const value = JSON.parse(await readFile(join(goldenDir, file), 'utf8'));
      const input = evalCaseSchema.parse(value);
      if (input.prompt_hash !== resumePromptHash()) {
        throw new Error(`Prompt hash mismatch in ${file}`);
      }
      return input;
    }),
  );
}

async function evaluateCase(input: EvalCase): Promise<unknown> {
  const state = buildResumeEvalState({
    ir: input.ir,
    job_profile: input.job_profile,
    proposal: input.proposal,
  });
  const raw = await jevCheck(state, resumeQuestions);
  const parsed = evalScoreSchema.safeParse(normalizeResumeEvalResult(raw));

  if (!parsed.success) {
    return {
      case_id: input.id,
      passed: false,
      expected: input.expected,
      error: `Unexpected JEV response: ${parsed.error.message}`,
      raw,
    };
  }

  return {
    case_id: input.id,
    passed: scoreMatches(input.expected, parsed.data),
    expected: input.expected,
    actual: parsed.data,
  };
}

async function main(): Promise<void> {
  const cases = await loadCases();
  const runAll = process.argv.includes('--all');
  const gate = process.argv.includes('--gate');
  const runsArg = process.argv.find((arg) => arg.startsWith('--runs='));
  const requestedRuns = Number(runsArg?.split('=')[1] || 1);
  const runs =
    Number.isFinite(requestedRuns) && requestedRuns >= 1
      ? Math.floor(requestedRuns)
      : 1;
  const selected = runAll ? cases : cases.slice(0, 1);
  const reports: unknown[] = [];

  console.log(
    `JEV resume evaluation: ${selected.length} case(s), ${runs} run(s)`,
  );
  console.log(`Prompt hash: ${resumePromptHash()}`);

  for (const input of selected) {
    for (let run = 1; run <= runs; run += 1) {
      try {
        const report = await evaluateCase(input);
        reports.push({ run, ...asRecord(report) });
        console.log(JSON.stringify({ run, ...asRecord(report) }));
      } catch (error) {
        const report = {
          run,
          case_id: input.id,
          passed: false,
          expected: input.expected,
          error: error instanceof Error ? error.message : String(error),
        };
        reports.push(report);
        console.log(JSON.stringify(report));
      }
    }
  }

  const passed = reports.filter(
    (report) => asRecord(report)?.passed === true,
  ).length;
  const scoreSpreads = selected.map((input) => {
    const scores = reports
      .filter((report) => asRecord(report)?.case_id === input.id)
      .map((report) => asRecord(asRecord(report)?.actual)?.skills_relevant)
      .filter((score): score is number => typeof score === 'number');
    return scores.length > 1
      ? (Math.max(...scores) - Math.min(...scores)) / 100
      : scores.length === 1
        ? 0
        : 1;
  });
  const maxVariance = scoreSpreads.length ? Math.max(...scoreSpreads) : 1;
  const agreementRate = reports.length ? passed / reports.length : 0;
  const gatePassed =
    runAll && runs >= 3 && agreementRate >= 0.8 && maxVariance < 0.15;

  console.log(
    JSON.stringify({
      agreement_rate: agreementRate,
      max_score_variance: maxVariance,
      gate_passed: gatePassed,
      reports,
    }),
  );
  if (gate && !gatePassed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
});
