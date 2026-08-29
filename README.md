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
