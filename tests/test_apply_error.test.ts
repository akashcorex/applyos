import { describe, expect, it } from 'bun:test';

import {
  applyErrorMessage,
  asDisplayError,
} from '../apps/web/src/lib/apply-error';

const pydanticDetail = {
  type: 'literal_error',
  loc: ['body', 'jobs', 0, 'source'],
  msg: "Input should be 'greenhouse', 'lever', 'ashby', 'workable', 'recruitee', 'personio', 'wellfound' or 'generic'",
  input: 'feed',
  ctx: { expected: 'greenhouse' },
};

describe('asDisplayError', () => {
  it('keeps a plain string', () => {
    expect(asDisplayError('Failed to start apply workflow', 'fallback')).toBe(
      'Failed to start apply workflow',
    );
  });

  it('reads FastAPI validation objects', () => {
    expect(asDisplayError(pydanticDetail, 'fallback')).toBe(pydanticDetail.msg);
    expect(asDisplayError([pydanticDetail], 'fallback')).toBe(
      pydanticDetail.msg,
    );
  });

  it('falls back when the payload is empty', () => {
    expect(asDisplayError(null, 'fallback')).toBe('fallback');
    expect(asDisplayError({}, 'fallback')).toBe('fallback');
  });
});

describe('applyErrorMessage', () => {
  it('does not treat a FastAPI 422 as a missing resume', () => {
    expect(applyErrorMessage(422, { error: [pydanticDetail] })).toBe(
      pydanticDetail.msg,
    );
    expect(applyErrorMessage(422, { error: pydanticDetail })).toBe(
      pydanticDetail.msg,
    );
  });

  it('keeps resume and profile 422 copy', () => {
    expect(
      applyErrorMessage(422, {
        code: 'RESUME_REQUIRED',
        error: 'Upload a resume before applying.',
      }),
    ).toBe('Upload a resume before applying.');
    expect(applyErrorMessage(422, { code: 'PROFILE_UNCONFIRMED' })).toBe(
      'Confirm your profile before applying.',
    );
  });
});
