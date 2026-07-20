/**
 * Result<T, E> — services return this for EXPECTED domain failures instead of
 * throwing (docs/03 §5, docs/07 §3). Only truly exceptional cases throw.
 */
export type Result<T, E = AppError> =
  | { ok: true; data: T }
  | { ok: false; error: E };

export const ok = <T>(data: T): Result<T, never> => ({ ok: true, data });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export type ErrorCode =
  | "unauthorized"
  | "forbidden"
  | "validation"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "integration_error"
  | "internal";

/** Typed application error mapped to the API envelope (docs/07 §3). */
export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "AppError";
  }

  static notFound(message = "Not found") {
    return new AppError("not_found", message);
  }
  static forbidden(message = "You do not have permission to do that") {
    return new AppError("forbidden", message);
  }
  static validation(fieldErrors: Record<string, string[]>, message = "Invalid input") {
    return new AppError("validation", message, fieldErrors);
  }
}
