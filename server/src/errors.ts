/** Error the API layer turns into a clean JSON response instead of a 500. */
export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code: string = 'error',
    public details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (m: string, code = 'bad_request', d?: unknown) => new HttpError(400, m, code, d);
export const unauthorized = (m = 'Not authenticated') => new HttpError(401, m, 'unauthorized');
export const notFound = (m = 'Not found') => new HttpError(404, m, 'not_found');
export const conflict = (m: string, code = 'conflict', d?: unknown) => new HttpError(409, m, code, d);
