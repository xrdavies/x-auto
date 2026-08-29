# x-auto Runbook

`x-auto` uses normal Google Chrome profiles for manual authentication and `@agent-infra/browser` for subsequent browser automation. It does not store X passwords or cookie values.

## Local Requirements

- macOS
- Node.js 24
- pnpm 10.34.1
- Google Chrome Stable

```bash
nvm use
corepack enable
corepack prepare pnpm@10.34.1 --activate
pnpm install
pnpm build
```

## Profile Login

Create and open a profile in normal Chrome:

```bash
node dist/cli.js profile create rebasecommunity
node dist/cli.js profile login rebasecommunity
```

Complete authentication manually, verify that Chrome reaches `https://x.com/home`, and close the entire Chrome window normally. Do not log in through an automated Chrome instance or a Chrome remote-debugging session.

Check and back up the profile:

```bash
node dist/cli.js profile check rebasecommunity --handle RebaseCommunity
node dist/cli.js profile status rebasecommunity
node dist/cli.js profile backup rebasecommunity
```

Only one Chrome process may use a profile at a time. Commands fail with `PROFILE_IN_USE` when the selected profile is already open.

## Text Validation

```bash
node dist/cli.js text check --text "hello https://example.com" --json
```

Validation uses `twitter-text` weighted length rules. `x-auto` never summarizes, truncates, rewrites, or splits supplied text. Invalid text fails before Chrome launches.

## Post

```bash
node dist/cli.js post \
  --profile rebasecommunity \
  --handle RebaseCommunity \
  --text "hello"
```

Use `--dry-run` to validate without opening Chrome. A successful post must return a tweet id and URL. `PUBLISH_UNKNOWN` means the action may have succeeded and must not be retried until the account timeline is checked manually.

## Thread

Create JSONL input:

```jsonl
{"text":"first post"}
{"text":"second post"}
{"text":"third post"}
```

Publish:

```bash
node dist/cli.js thread \
  --profile rebasecommunity \
  --handle RebaseCommunity \
  --file thread.jsonl
```

All posts are validated before Chrome launches. The implementation requires X's add-post and publish-all controls. Missing or changed controls return `THREAD_CONTROL_NOT_FOUND`; the tool never falls back to independent posts. `PARTIAL_THREAD` includes confirmed tweet ids and must be resolved manually.

## Interactions

```bash
node dist/cli.js like --profile rebasecommunity --handle RebaseCommunity --tweet 123
node dist/cli.js retweet --profile rebasecommunity --handle RebaseCommunity --tweet https://x.com/user/status/123
node dist/cli.js quote --profile rebasecommunity --handle RebaseCommunity --tweet 123 --text "quote"
node dist/cli.js comment --profile rebasecommunity --handle RebaseCommunity --tweet 123 --text "reply"
```

Like and retweet are idempotent based on the visible X action state. Quote and comment must return the created tweet id.

## Remote Installation

Default test host:

```text
rebase@x-auto.host
```

Check, install dependencies, and deploy:

```bash
node dist/cli.js remote check --host rebase@x-auto.host
node dist/cli.js remote install --host rebase@x-auto.host
node dist/cli.js remote deploy --host rebase@x-auto.host
```

Installation is limited to x-auto prerequisites: Node.js 24.15.0, pnpm 10.34.1, Chrome Stable, Xvfb, x11vnc, x11-utils, curl, OpenSSL, and rsync. Deployment uses rsync and does not require the private GitHub key on the server.

## Remote Login With VNC

```bash
node dist/cli.js remote login-start \
  --host rebase@x-auto.host \
  --profile rebasecommunity
```

The command prints a one-time VNC password, creates an SSH tunnel, and opens macOS Screen Sharing at `vnc://127.0.0.1:5907`. The remote VNC server listens only on remote localhost.

After manual login reaches X home:

```bash
node dist/cli.js remote login-stop \
  --host rebase@x-auto.host \
  --profile rebasecommunity
```

This closes Chrome, creates a timestamped profile backup, stops VNC/Xvfb, and closes the SSH tunnel.

## Remote Actions

Prefix local actions with `remote` and supply the host:

```bash
node dist/cli.js remote post \
  --host rebase@x-auto.host \
  --profile rebasecommunity \
  --handle RebaseCommunity \
  --text "remote post"
```

The same applies to `thread`, `retweet`, `quote`, `like`, `comment`, and `profile-check`.

## Publisher Service

Local foreground service:

```bash
node dist/cli.js serve \
  --profile rebasecommunity \
  --handle RebaseCommunity \
  --socket ~/.x-auto/state/rebasecommunity.sock
```

Remote systemd user service:

```bash
node dist/cli.js remote service-install --host rebase@x-auto.host --profile rebasecommunity --handle RebaseCommunity
node dist/cli.js remote service-start --host rebase@x-auto.host --profile rebasecommunity
node dist/cli.js remote service-status --host rebase@x-auto.host --profile rebasecommunity
node dist/cli.js remote service-stop --host rebase@x-auto.host --profile rebasecommunity
```

The Unix socket mode is `0600`. Actions for one profile are serialized. Action logs are stored under `~/.x-auto/state` without post text, cookie values, passwords, or request headers.

## Failure Handling

- Every failed CLI action exits non-zero.
- `--json` returns a stable error object with code, message, retryable flag, and optional details.
- `PUBLISH_UNKNOWN` and `PARTIAL_THREAD` are never retried automatically.
- Authentication challenges, CAPTCHAs, or account locks require manual login recovery.
- X UI changes must fail closed; selectors are not guessed and thread publishing never changes semantics.

## Security

- Browser profiles are session credentials and must not enter Git or deployment archives.
- VNC is localhost-only and accessed through SSH forwarding.
- Chrome debugging ports are never exposed.
- Publisher uses a private Unix socket rather than a TCP listener.
- This browser automation may conflict with X terms or trigger account controls. Use low volume and explicit operator supervision.
