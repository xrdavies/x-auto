# Unix Socket API

Start the service with a profile, expected handle, and socket path. All requests and responses use JSON.

The foreground CLI accepts either `--profile <id>` or `--profile-path <absolute-path>`. The two selectors are mutually exclusive.

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
