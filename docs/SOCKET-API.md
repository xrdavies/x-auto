# Unix Socket API

Start the service with a profile, expected handle, and socket path. All requests and responses use JSON.

The foreground CLI accepts either `--profile <id>` or `--profile-path <absolute-path>`. The two selectors are mutually exclusive.

## Service Model

`XAutoClient` and `curl` are service clients; they do not start the service or perform direct one-shot browser automation. Start the service with CLI `serve` or manage its remote systemd unit with the CLI `remote service-*` commands.

One service instance binds one Profile to one Unix socket. Requests to that instance share a serialized queue. The service process stays resident, but Chrome starts and closes for every action. Run multiple Profiles as separate service instances with different sockets; their queues are independent and may execute concurrently.

Do not mix direct CLI actions or duplicate service instances with the service for the same Profile. They bypass its queue and may contend for the Chrome Profile.

The repository includes a thin TypeScript client and a runnable Node.js example at [`examples/unix-socket-client.mjs`](../examples/unix-socket-client.mjs). Import `XAutoClient` from the package after `pnpm build`:

```ts
import { XAutoClient } from '@teamtaoist/x-auto';

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

The service never accepts account passwords or cookies and never rewrites supplied text.
