# x-auto

Reusable X browser automation built on normal Chrome profiles and `@agent-infra/browser`.

See [Runbook](docs/RUNBOOK.md), [Unix Socket API](docs/SOCKET-API.md), and [Implementation Plan](docs/PLAN.md).

Initial scope:

- macOS profile creation, manual login, and session checks
- text validation before browser launch
- text-only post and strict thread publishing
- retweet, quote, like, and comment
- Ubuntu deployment and VNC-assisted manual login
- Unix socket automation service

The tool never stores X passwords or cookie values. It stops on login challenges and never downgrades a failed thread workflow into independent posts.

## Usage Modes

| Mode | Start and invoke | Service required | Queue |
| --- | --- | --- | --- |
| One-shot | Run a local or remote CLI action | No | No shared queue |
| Service | Start `serve` or a systemd unit, then call it with `XAutoClient` or `curl` | Yes | One serialized queue per service instance |

One-shot CLI actions start Chrome for one operation and close it afterward. `XAutoClient` is only a Unix Socket client; it does not provide direct one-shot browser automation or start the service.

Each service instance is configured for one Profile and one socket. The service process stays resident, while Chrome still starts and closes for each queued action. Multiple Profiles can run as separate service instances with separate sockets and independent queues. Once a Profile has a service, send every automated action for that Profile through its socket; direct CLI actions and duplicate service instances bypass that queue and can conflict.

For a Node.js client example, see [`examples/unix-socket-client.mjs`](examples/unix-socket-client.mjs).

Internal Node.js applications can import the thin client after `pnpm build`:

```ts
import { XAutoClient } from '@teamtaoist/x-auto';

const x = new XAutoClient({
  socketPath: '/home/app/.x-auto/state/<profile-id>.sock',
});

const result = await x.post({ text: '要发布的推文内容' });
```

The client only talks to the Unix Socket service; it does not start Chrome or read Profile data.

## Requirements

- macOS for local commands
- Node.js 24
- pnpm 10.34.1
- Google Chrome Stable

## Development

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

## Profile Commands

```bash
pnpm dev -- profile create <profile-id>
pnpm dev -- profile login <profile-id>
pnpm dev -- profile check <profile-id> --handle <x-handle>
pnpm dev -- profile status <profile-id>
pnpm dev -- profile backup <profile-id>
```

Use an existing Chrome user data directory without copying it:

```bash
pnpm dev -- profile check --profile-path /absolute/path/to/profile --handle <x-handle>
pnpm dev -- post --profile-path /absolute/path/to/profile --handle <x-handle> --text "hello"
```

`--profile` and `--profile-path` are mutually exclusive. Explicit paths must be absolute.

## Text And Publishing

```bash
pnpm dev -- text check --text "hello" --json
pnpm dev -- post --profile <profile-id> --handle <x-handle> --text "hello"
pnpm dev -- thread --profile <profile-id> --handle <x-handle> --file thread.jsonl
```

Use `--dry-run` to validate all text without opening Chrome. Thread publishing requires X's add-post and publish-all controls; missing controls fail and never fall back to independent posts.

## Interactions

```bash
pnpm dev -- retweet --profile <profile-id> --handle <x-handle> --tweet https://x.com/user/status/123
pnpm dev -- quote --profile <profile-id> --handle <x-handle> --tweet 123 --text "quote"
pnpm dev -- like --profile <profile-id> --handle <x-handle> --tweet 123
pnpm dev -- comment --profile <profile-id> --handle <x-handle> --tweet 123 --text "reply"
```

## Remote Ubuntu

```bash
pnpm dev -- remote check --host <ssh-user>@<remote-host>
pnpm dev -- remote install --host <ssh-user>@<remote-host>
pnpm dev -- remote deploy --host <ssh-user>@<remote-host>
pnpm dev -- remote login-start --host <ssh-user>@<remote-host> --profile <profile-id>
pnpm dev -- remote login-stop --host <ssh-user>@<remote-host> --profile <profile-id>
pnpm dev -- remote post --host <ssh-user>@<remote-host> --profile <profile-id> --handle <x-handle> --text "hello"
```

Remote deployment uses rsync, so the private GitHub repository key is not required on the Ubuntu host. VNC listens only on remote localhost and is accessed through an SSH tunnel.

## Unix Socket Service

```bash
pnpm dev -- serve --profile <profile-id> --handle <x-handle> --socket ~/.x-auto/state/<profile-id>.sock
pnpm dev -- remote service-install --host <ssh-user>@<remote-host> --profile <profile-id> --handle <x-handle>
pnpm dev -- remote service-start --host <ssh-user>@<remote-host> --profile <profile-id>
pnpm dev -- remote service-status --host <ssh-user>@<remote-host> --profile <profile-id>
pnpm dev -- remote service-stop --host <ssh-user>@<remote-host> --profile <profile-id>
```

Use a different Profile ID and socket for each additional resident service. `XAutoClient` and `curl` invoke an existing service; the CLI `serve` and `remote service-*` commands manage its lifecycle.
