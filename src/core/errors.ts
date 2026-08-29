export type XAutoErrorCode =
  | 'INVALID_ARGUMENT'
  | 'PROFILE_NOT_FOUND'
  | 'PROFILE_IN_USE'
  | 'SESSION_NOT_AUTHENTICATED'
  | 'ACCOUNT_MISMATCH'
  | 'TEXT_EMPTY'
  | 'TEXT_TOO_LONG'
  | 'TARGET_INVALID'
  | 'TARGET_NOT_FOUND'
  | 'THREAD_INVALID'
  | 'THREAD_CONTROL_NOT_FOUND'
  | 'BROWSER_LAUNCH_FAILED'
  | 'BROWSER_NAVIGATION_FAILED'
  | 'ACTION_NOT_AVAILABLE'
  | 'PUBLISH_FAILED'
  | 'PUBLISH_UNKNOWN'
  | 'PARTIAL_THREAD'
  | 'REMOTE_CONNECTION_FAILED'
  | 'REMOTE_DEPENDENCY_MISSING'
  | 'REMOTE_DEPLOY_FAILED'
  | 'REMOTE_LOGIN_REQUIRED';

export class XAutoError extends Error {
  readonly code: XAutoErrorCode;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(code: XAutoErrorCode, message: string, options: { retryable?: boolean; details?: Record<string, unknown> } = {}) {
    super(message);
    this.name = 'XAutoError';
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.details = options.details;
  }
}

export const serializeError = (error: unknown) => {
  if (error instanceof XAutoError) {
    return { code: error.code, message: error.message, retryable: error.retryable, ...(error.details ? { details: error.details } : {}) };
  }
  return { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : String(error), retryable: false };
};
