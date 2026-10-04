# Unix Socket API

Start the service with a profile, expected handle, and socket path. All requests and responses use JSON.

The foreground CLI accepts either `--profile <id>` or `--profile-path <absolute-path>`. The two selectors are mutually exclusive.

## Service Model

`XAutoClient` and `curl` are service clients; they do not start the service or perform direct one-shot browser automation. Start the service with CLI `serve` or manage its remote systemd unit with the CLI `remote service-*` commands.

One service instance binds one Profile to one Unix socket. Requests to that instance share a serialized queue. The service process stays resident, but Chrome starts and closes for every action. Run multiple Profiles as separate service instances with different sockets; their queues are independent and may execute concurrently.

Do not mix direct CLI actions or duplicate service instances with the service for the same Profile. They bypass its queue and may contend for the Chrome Profile.

The repository includes a thin TypeScript client and a runnable Node.js example at [`examples/unix-socket-client.mjs`](../examples/unix-socket-client.mjs). Import `XAutoClient` from the package after `pnpm build`:

```ts
import { XAutoClient } from '@xrdavies/x-auto';

const client = new XAutoClient({ socketPath: '/home/app/.x-auto/state/<profile-id>.sock' });
await client.ready();
await client.post({ text: '要发布的推文内容' });
```

The client only checks `/ready` when the example is run directly; action calls are commented out to avoid accidental publishing.

The same API can be called with `curl`:

```bash
SOCKET="$HOME/.x-auto/state/<profile-id>.sock"

curl --unix-socket "$SOCKET" http://localhost/ready

curl --unix-socket "$SOCKET" \
  -H 'Content-Type: application/json' \
  -d '{"text":"要发布的推文内容"}' \
  http://localhost/post
```

## Health

```http
GET /ready
```

## Check

```http
POST /check
{}
```

## Post

```http
POST /post
{"text":"hello"}
```

## Thread

```http
POST /thread
{"posts":["first","second"]}
```

Thread controls are strict. Missing add-post or publish-all controls return an error and never publish independent posts.

## Interactions

```http
POST /retweet
{"tweet":"https://x.com/user/status/123"}

POST /like
{"tweet":"123"}

POST /quote
{"tweet":"123","text":"quote"}

POST /comment
{"tweet":"123","text":"reply"}
```

## Response

Success:

```json
{"success":true,"action":"post","tweetId":"123","url":"https://x.com/account/status/123"}
```

Failure:

```json
{
  "success": false,
  "action": "post",
  "error": {
    "code": "PUBLISH_UNKNOWN",
    "message": "未收到 X 发布响应，推文可能已经发布，请人工检查",
    "retryable": false
  }
}
```

HTTP status codes for failures:

| Status | Meaning | Codes |
| --- | --- | --- |
| 404 | Unknown endpoint | `NOT_FOUND` |
| 409 | Profile busy | `PROFILE_IN_USE` |
| 422 | Invalid input | `INVALID_ARGUMENT`, `TEXT_EMPTY`, `TEXT_TOO_LONG`, `TARGET_INVALID`, `THREAD_INVALID` |
| 502 | X did not behave as expected | `TARGET_NOT_FOUND`, `ACTION_NOT_AVAILABLE`, `THREAD_CONTROL_NOT_FOUND`, `PUBLISH_FAILED`, `PUBLISH_UNKNOWN`, `PARTIAL_THREAD` |
| 503 | Environment or login not ready | `PROFILE_NOT_FOUND`, `SESSION_NOT_AUTHENTICATED`, `ACCOUNT_MISMATCH`, `BROWSER_LAUNCH_FAILED`, `BROWSER_NAVIGATION_FAILED` |
| 500 | Unexpected error | `INTERNAL_ERROR` |

Check `error.code` and `error.retryable` rather than the status alone. `PUBLISH_UNKNOWN` and `PARTIAL_THREAD` mean the post may already be live; check X before retrying.

`XAutoClient` waits up to 5 minutes by default. On timeout it throws `CLIENT_TIMEOUT` with `retryable: false`; the queued action keeps running on the server and may still publish.

The service never accepts account passwords or cookies and never rewrites supplied text.
