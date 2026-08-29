# Implementation Plan

## Scope

`x-auto` is a general X browser automation tool. It contains no application-specific content conversion or database integration.

## Phases

1. Profile management, normal Chrome login, session check, and text validation.
2. Single post and strict X thread publishing. Missing thread controls fail without fallback.
3. Retweet, quote, like, and comment with structured errors and idempotent state detection.
4. Ubuntu dependency checks, installation, deployment, VNC login, SSH tunnel, and remote actions.
5. Unix socket service, systemd user service, runbooks, and end-to-end acceptance.

## Runtime Decisions

- Node.js 24
- TypeScript
- pnpm 10.34.1
- `@agent-infra/browser` and Google Chrome profiles
- macOS-only local automation
- Ubuntu remote automation
- text only in the first release
- no summarization, truncation, or automatic thread splitting
- structured error codes and non-zero exits
- no automatic retry for unknown publish results
