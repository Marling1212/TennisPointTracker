/**
 * Supabase Auth / PostgREST errors are often plain objects with `message`
 * and are not guaranteed to be `instanceof Error`.
 */
export function extractErrorMessage(error: unknown): string | null {
  if (error === null || error === undefined) return null;

  if (error instanceof Error && typeof error.message === "string" && error.message.trim()) {
    return error.message.trim();
  }

  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  if (typeof error === "object") {
    const o = error as Record<string, unknown>;
    if (typeof o.message === "string" && o.message.trim()) {
      return o.message.trim();
    }
    if (typeof o.error_description === "string" && o.error_description.trim()) {
      return o.error_description.trim();
    }
    if (typeof o.msg === "string" && o.msg.trim()) {
      return o.msg.trim();
    }
  }

  return null;
}
