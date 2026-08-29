# Unix Socket API

Start the service with a profile, expected handle, and socket path. All requests and responses use JSON.

The foreground CLI accepts either `--profile <id>` or `--profile-path <absolute-path>`. The two selectors are mutually exclusive.

The repository includes a Node.js standard-library client template at [`examples/unix-socket-client.mjs`](../examples/unix-socket-client.mjs). It only checks `/ready` by default; copy and enable the action call needed by the integrating application.

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
