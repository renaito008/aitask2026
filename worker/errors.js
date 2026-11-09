export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function requireThat(ok, status, message) { if (!ok) throw new ApiError(status, message); }
// Only domain operations enter this wrapper; infrastructure errors stay private.
export function business(operation) {
  try { return operation(); }
  catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof TypeError) throw new ApiError(400, '入力形式を確認してください。');
    throw new ApiError(422, error.message);
  }
}
