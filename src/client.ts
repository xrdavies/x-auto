import { request as httpRequest } from 'node:http';

export type XAutoClientOptions = {
  socketPath: string;
  timeoutMs?: number;
};

export type ReadyResponse = {
  success: true;
  service: 'x-auto';
  profile: string;
  profilePath: string;
};

export type CheckResponse = {
  success: true;
  action: 'check';
  handle: string;
};

export type PostResponse = {
  success: true;
  action: 'post';
  tweetId: string;
  url: string;
  weightedLength: number;
};

export type ThreadResponse = {
  success: true;
  action: 'thread';
  tweetIds: string[];
  rootUrl: string;
};

export type InteractionResponse = {
  success: true;
  action: 'like' | 'retweet' | 'quote' | 'comment';
  targetTweetId: string;
  alreadyApplied?: boolean;
  tweetId?: string;
  url?: string;
};

export type XAutoErrorPayload = {
  code: string;
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
};

export class XAutoClientError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;
  readonly statusCode?: number;

  constructor(payload: XAutoErrorPayload, statusCode?: number) {
    super(payload.message);
    this.name = 'XAutoClientError';
    this.code = payload.code;
    this.retryable = payload.retryable;
    this.details = payload.details;
    this.statusCode = statusCode;
  }
}

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject => typeof value === 'object' && value !== null;

const errorPayload = (value: unknown, path: string): XAutoErrorPayload => {
  if (isObject(value) && isObject(value.error) && typeof value.error.code === 'string' && typeof value.error.message === 'string') {
    return {
      code: value.error.code,
      message: value.error.message,
      retryable: value.error.retryable === true,
      ...(isObject(value.error.details) ? { details: value.error.details } : {}),
    };
  }
  return { code: 'CLIENT_PROTOCOL_ERROR', message: `x-auto 返回了无效响应：${path}`, retryable: false };
};

export class XAutoClient {
  readonly socketPath: string;
  readonly timeoutMs: number;

  constructor({ socketPath, timeoutMs = 30_000 }: XAutoClientOptions) {
    if (!socketPath) throw new TypeError('socketPath 不能为空');
    this.socketPath = socketPath;
    this.timeoutMs = timeoutMs;
  }

  private request<T>(method: string, path: string, body?: JsonObject): Promise<T> {
    return new Promise((resolvePromise, reject) => {
      const payload = body === undefined ? undefined : JSON.stringify(body);
      const request = httpRequest({
        socketPath: this.socketPath,
        method,
        path,
        headers: payload === undefined ? {} : {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload),
        },
      }, (response) => {
        let data = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => { data += chunk; });
        response.on('end', () => {
          let result: unknown;
          try {
            result = JSON.parse(data);
          } catch {
            reject(new XAutoClientError({ code: 'CLIENT_PROTOCOL_ERROR', message: `x-auto 返回了无效 JSON：${path}`, retryable: false }, response.statusCode));
            return;
          }
          if ((response.statusCode ?? 500) >= 400 || !isObject(result) || result.success !== true) {
            reject(new XAutoClientError(errorPayload(result, path), response.statusCode));
            return;
          }
          resolvePromise(result as T);
        });
      });

      request.setTimeout(this.timeoutMs, () => request.destroy(new Error(`x-auto 请求超时：${path}`)));
      request.on('error', reject);
      if (payload !== undefined) request.write(payload);
      request.end();
    });
  }

  ready() {
    return this.request<ReadyResponse>('GET', '/ready');
  }

  check() {
    return this.request<CheckResponse>('POST', '/check', {});
  }

  post(payload: { text: string }) {
    return this.request<PostResponse>('POST', '/post', payload);
  }

  thread(payload: { posts: string[] }) {
    return this.request<ThreadResponse>('POST', '/thread', payload);
  }

  retweet(payload: { tweet: string }) {
    return this.request<InteractionResponse>('POST', '/retweet', payload);
  }

  like(payload: { tweet: string }) {
    return this.request<InteractionResponse>('POST', '/like', payload);
  }

  quote(payload: { tweet: string; text: string }) {
    return this.request<InteractionResponse>('POST', '/quote', payload);
  }

  comment(payload: { tweet: string; text: string }) {
    return this.request<InteractionResponse>('POST', '/comment', payload);
  }
}
