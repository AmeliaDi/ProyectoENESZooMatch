/**
 * Request-scoped diagnostics. The security wrapper opens the scope once per
 * request so a failure built deep inside a route carries the same id the
 * wrapper logs and returns in `X-Request-Id`. Only an id and a code live
 * here: never a body, a PIN, a matrícula or a hash.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

interface RequestScope {
  requestId: string;
  failureCode: string | null;
}

const storage = new AsyncLocalStorage<RequestScope>();

export function withRequestScope<T>(run: (requestId: string) => T): T {
  const requestId = randomUUID();
  return storage.run({ requestId, failureCode: null }, () => run(requestId));
}

/** The id of the request being served, or a fresh one outside a scope (tests). */
export function currentRequestId(): string {
  return storage.getStore()?.requestId ?? randomUUID();
}

export function recordFailureCode(code: string): void {
  const scope = storage.getStore();
  if (scope) scope.failureCode = code;
}

export function recordedFailureCode(): string | null {
  return storage.getStore()?.failureCode ?? null;
}