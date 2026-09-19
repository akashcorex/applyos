import { experimental_evaluate as evaluate } from 'ai';

export type JevQuestions = Parameters<typeof evaluate>[0]['questions'];

export async function jevCheck(
  state: string,
  questions: JevQuestions,
): Promise<unknown> {
  return evaluate({
    model: 'typesafe-ai/jev',
    state,
    questions,
  });
}
