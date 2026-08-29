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

## Execution Modes

### One-shot CLI

Local and remote action commands execute one operation without a publisher service. Each command validates the request, starts Chrome with the selected Profile, performs the action, closes Chrome, and exits. There is no queue shared across separate CLI processes.

```bash
node dist/cli.js post --profile <profile-id> --handle <x-handle> --text "one-shot post"
node dist/cli.js remote post --host <ssh-user>@<remote-host> --profile <profile-id> --handle <x-handle> --text "remote one-shot post"
```

`XAutoClient` does not implement this mode. It only connects to an already-running Unix Socket service.

### Publisher Service

Start one service instance for each Profile. The service process stays resident, but Chrome starts and closes for every action. Requests received by one service instance are executed through its serialized queue.

```text
application -> XAutoClient or curl -> profile socket -> profile service queue -> Chrome action
```

Multiple Profiles can be resident at the same time because each has a separate systemd instance, socket, and queue. They may execute concurrently. Never send direct CLI actions or start a second service for a Profile already managed by a service; those paths do not share its queue.

## Profile Login

Create and open a profile in normal Chrome:

```bash
node dist/cli.js profile create <profile-id>
node dist/cli.js profile login <profile-id>
```

Complete authentication manually, verify that Chrome reaches `https://x.com/home`, and close the entire Chrome window normally. Do not log in through an automated Chrome instance or a Chrome remote-debugging session.

Check and back up the profile:

```bash
node dist/cli.js profile check <profile-id> --handle <x-handle>
node dist/cli.js profile status <profile-id>
node dist/cli.js profile backup <profile-id>
```

Only one Chrome process may use a profile at a time. Commands fail with `PROFILE_IN_USE` when the selected profile is already open.

### Existing Profile Paths

CLI actions can use an existing Chrome user data directory directly:

```bash
node dist/cli.js profile check \
  --profile-path /absolute/path/to/profile \
  --handle <x-handle>

node dist/cli.js post \
  --profile-path /absolute/path/to/profile \
  --handle <x-handle> \
  --text "hello"
```

`--profile` and `--profile-path` are mutually exclusive, and explicit paths must be absolute. Normal actions do not copy or move the directory; Chrome may update it as part of the requested action. An explicit `profile backup` command copies the selected directory under `~/.x-auto/backups`.

Remote CLI forwarding supports the same selector:

```bash
node dist/cli.js remote profile-check \
  --host <ssh-user>@<remote-host> \
  --profile-path /absolute/path/to/chrome-profile \
  --handle <x-handle>
```

Remote VNC login sessions and systemd user services deliberately require managed Profile IDs. Use `--profile-path` for maintenance checks and one-shot actions, not long-running service configuration.

## Text Validation

```bash
node dist/cli.js text check --text "hello https://example.com" --json
```

Validation uses `twitter-text` weighted length rules. `x-auto` never summarizes, truncates, rewrites, or splits supplied text. Invalid text fails before Chrome launches.

## Post

```bash
node dist/cli.js post \
  --profile <profile-id> \
  --handle <x-handle> \
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
  --profile <profile-id> \
  --handle <x-handle> \
  --file thread.jsonl
```

All posts are validated before Chrome launches. The implementation requires X's add-post and publish-all controls. Missing or changed controls return `THREAD_CONTROL_NOT_FOUND`; the tool never falls back to independent posts. `PARTIAL_THREAD` includes confirmed tweet ids and must be resolved manually.

## Interactions

```bash
node dist/cli.js like --profile <profile-id> --handle <x-handle> --tweet 123
node dist/cli.js retweet --profile <profile-id> --handle <x-handle> --tweet https://x.com/user/status/123
node dist/cli.js quote --profile <profile-id> --handle <x-handle> --tweet 123 --text "quote"
node dist/cli.js comment --profile <profile-id> --handle <x-handle> --tweet 123 --text "reply"
```

Like and retweet are idempotent based on the visible X action state. Quote and comment must return the created tweet id.

## Remote Installation

Remote host placeholder:

```text
<ssh-user>@<remote-host>
```

Check and install operating-system dependencies:

```bash
node dist/cli.js remote check --host <ssh-user>@<remote-host>
node dist/cli.js remote install --host <ssh-user>@<remote-host>
```

### Development Source Deployment

Use source deployment while developing or testing changes:

```bash
node dist/cli.js remote deploy --host <ssh-user>@<remote-host>
```

This synchronizes the local source tree to `~/x-auto`, excludes `dist`, then installs dependencies and builds on the remote host. It requires a local x-auto source checkout and does not require the private GitHub repository key on the Ubuntu host.

### Production npm Installation

Install a published exact version for normal use:

```bash
node dist/cli.js remote package-install \
  --host <ssh-user>@<remote-host> \
  --version 0.1.0
```

The package is installed with `npm --omit=dev` under `~/.local/x-auto/releases/0.1.0`; `~/.local/x-auto/current` points to the active package. npm installation does not compile the source repository. The remote host still needs the prerequisites from `remote install`, including Node.js 24 and Chrome Stable.

To upgrade an npm-managed service, install the new exact version and restart the unit:

```bash
node dist/cli.js remote package-install --host <ssh-user>@<remote-host> --version 0.2.0
node dist/cli.js remote service-restart --host <ssh-user>@<remote-host> --profile <profile-id>
```

The previous release remains under `~/.local/x-auto/releases` and can be selected again with `remote package-install` if rollback is needed.

## Remote Login With VNC

```bash
node dist/cli.js remote login-start \
  --host <ssh-user>@<remote-host> \
  --profile <profile-id>
```

For an npm installation, add `--source npm` to use `~/.local/x-auto/current`:

```bash
node dist/cli.js remote login-start \
  --host <ssh-user>@<remote-host> \
  --source npm \
  --profile <profile-id>
```

The command prints a one-time VNC password, creates an SSH tunnel, and opens macOS Screen Sharing at `vnc://127.0.0.1:5907`. The remote VNC server listens only on remote localhost.

After manual login reaches X home:

```bash
node dist/cli.js remote login-stop \
  --host <ssh-user>@<remote-host> \
  --profile <profile-id>
```

This closes Chrome, creates a timestamped profile backup, stops VNC/Xvfb, and closes the SSH tunnel.

## Remote Actions

Prefix local actions with `remote` and supply the host:

```bash
node dist/cli.js remote post \
  --host <ssh-user>@<remote-host> \
  --profile <profile-id> \
  --handle <x-handle> \
  --text "remote post"
```

For a published npm version, add `--source npm` to remote actions. The same option applies to `thread`, `retweet`, `quote`, `like`, `comment`, and `profile-check`.

For `remote thread`, `--file` points to a local JSONL file. x-auto uploads it to a private remote temporary directory and removes it after the action finishes.

## Publisher Service

Local foreground service:

```bash
node dist/cli.js serve \
  --profile <profile-id> \
  --handle <x-handle> \
  --socket ~/.x-auto/state/<profile-id>.sock
```

A foreground service can also use `--profile-path /absolute/path`. The systemd installation workflow continues to use managed Profile IDs.

Remote systemd user service:

```bash
node dist/cli.js remote service-install --host <ssh-user>@<remote-host> --profile <profile-id> --handle <x-handle>
node dist/cli.js remote service-install --host <ssh-user>@<remote-host> --source npm --profile <profile-id> --handle <x-handle>
node dist/cli.js remote service-start --host <ssh-user>@<remote-host> --profile <profile-id>
node dist/cli.js remote service-restart --host <ssh-user>@<remote-host> --profile <profile-id>
node dist/cli.js remote service-status --host <ssh-user>@<remote-host> --profile <profile-id>
node dist/cli.js remote service-stop --host <ssh-user>@<remote-host> --profile <profile-id>
```

The Unix socket mode is `0600`. Actions for one profile are serialized. Action logs are stored under `~/.x-auto/state` without post text, cookie values, passwords, or request headers.

For two Profiles, install and start two independent instances:

```bash
node dist/cli.js remote service-install --host <ssh-user>@<remote-host> --profile <first-profile> --handle <first-handle>
node dist/cli.js remote service-install --host <ssh-user>@<remote-host> --profile <second-profile> --handle <second-handle>
node dist/cli.js remote service-start --host <ssh-user>@<remote-host> --profile <first-profile>
node dist/cli.js remote service-start --host <ssh-user>@<remote-host> --profile <second-profile>
```

Applications connect to `~/.x-auto/state/<first-profile>.sock` and `~/.x-auto/state/<second-profile>.sock` with separate `XAutoClient` instances.

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
