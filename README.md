# x-auto

Reusable X browser automation built on normal Chrome profiles and `@agent-infra/browser`.

Initial scope:

- macOS profile creation, manual login, and session checks
- text validation before browser launch
- text-only post and strict thread publishing
- retweet, quote, like, and comment
- Ubuntu deployment and VNC-assisted manual login
- Unix socket automation service

The tool never stores X passwords or cookie values. It stops on login challenges and never downgrades a failed thread workflow into independent posts.

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
pnpm dev -- profile create rebasecommunity
pnpm dev -- profile login rebasecommunity
pnpm dev -- profile check rebasecommunity --handle RebaseCommunity
pnpm dev -- profile status rebasecommunity
pnpm dev -- profile backup rebasecommunity
```

## Text And Publishing

```bash
pnpm dev -- text check --text "hello" --json
pnpm dev -- post --profile rebasecommunity --handle RebaseCommunity --text "hello"
pnpm dev -- thread --profile rebasecommunity --handle RebaseCommunity --file thread.jsonl
```

Use `--dry-run` to validate all text without opening Chrome. Thread publishing requires X's add-post and publish-all controls; missing controls fail and never fall back to independent posts.

## Interactions

```bash
pnpm dev -- retweet --profile rebasecommunity --handle RebaseCommunity --tweet https://x.com/user/status/123
pnpm dev -- quote --profile rebasecommunity --handle RebaseCommunity --tweet 123 --text "quote"
pnpm dev -- like --profile rebasecommunity --handle RebaseCommunity --tweet 123
pnpm dev -- comment --profile rebasecommunity --handle RebaseCommunity --tweet 123 --text "reply"
```

## Remote Ubuntu

```bash
pnpm dev -- remote check --host rebase@x-auto.host
pnpm dev -- remote install --host rebase@x-auto.host
pnpm dev -- remote deploy --host rebase@x-auto.host
pnpm dev -- remote login-start --host rebase@x-auto.host --profile rebasecommunity
pnpm dev -- remote login-stop --host rebase@x-auto.host --profile rebasecommunity
pnpm dev -- remote post --host rebase@x-auto.host --profile rebasecommunity --handle RebaseCommunity --text "hello"
```

Remote deployment uses rsync, so the private GitHub repository key is not required on the Ubuntu host. VNC listens only on remote localhost and is accessed through an SSH tunnel.
