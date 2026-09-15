export class RequestBodyTooLargeError extends Error {
  constructor() {
    super('Request body exceeds the allowed size');
    this.name = 'RequestBodyTooLargeError';
  }
}

export async function readRequestBodyWithLimit(
  request: Request,
  maxBytes: number,
): Promise<Uint8Array> {
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new RequestBodyTooLargeError();
  }

  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new RequestBodyTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export function tooLargeResponse(): Response {
  return Response.json(
    { error: 'Request body exceeds the allowed size' },
    { status: 413 },
  );
}
