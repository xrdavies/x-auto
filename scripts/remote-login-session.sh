#!/usr/bin/env bash

set -euo pipefail

action="${1:-status}"
profile_id="${2:-}"
[[ "$profile_id" =~ ^[a-z0-9][a-z0-9_-]{0,63}$ ]] || { echo 'invalid or missing profile id' >&2; exit 1; }

ROOT="${X_AUTO_HOME:-$HOME/.x-auto}"
PROFILE_DIR="$ROOT/profiles/$profile_id"
STATE_DIR="$ROOT/state/login-$profile_id"
BACKUP_DIR="$ROOT/backups"
DISPLAY_NUMBER="${X_AUTO_DISPLAY:-97}"
DISPLAY_VALUE=":$DISPLAY_NUMBER"
VNC_PORT="${X_AUTO_VNC_PORT:-5907}"
CHROME_BIN="${CHROME_PATH:-/usr/bin/google-chrome-stable}"

pid_file() { printf '%s/%s.pid' "$STATE_DIR" "$1"; }
read_pid() { [[ -f "$(pid_file "$1")" ]] && cat "$(pid_file "$1")"; }
is_running() { local pid; pid="$(read_pid "$1" || true)"; [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; }

stop_process() {
  local name="$1" pid
  pid="$(read_pid "$name" || true)"
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    kill -TERM "$pid"
    for _ in $(seq 1 40); do kill -0 "$pid" 2>/dev/null || break; sleep 0.25; done
  fi
  [[ ! -f "$(pid_file "$name")" ]] || unlink "$(pid_file "$name")"
}

backup_profile() {
  is_running chrome && { echo 'Chrome is still using the profile' >&2; exit 1; }
  [[ -d "$PROFILE_DIR" ]] || { echo "profile not found: $profile_id" >&2; exit 1; }
  mkdir -p "$BACKUP_DIR"
  backup_path="$BACKUP_DIR/${profile_id}-$(date +%Y%m%d-%H%M%S)"
  cp -a "$PROFILE_DIR" "$backup_path"
  chmod -R go-rwx "$backup_path"
  printf 'PROFILE_BACKUP=%s\n' "$backup_path"
}

start() {
  for command in Xvfb x11vnc xdpyinfo ss openssl "$CHROME_BIN"; do command -v "$command" >/dev/null || { echo "missing dependency: $command" >&2; exit 1; }; done
  if is_running chrome || is_running x11vnc || is_running xvfb; then
    echo 'login session is already running' >&2
    exit 1
  fi
  [[ ! -e "/tmp/.X${DISPLAY_NUMBER}-lock" ]] || { echo "display $DISPLAY_VALUE is in use" >&2; exit 1; }
  ! ss -ltn | grep -q "127.0.0.1:${VNC_PORT} " || { echo "VNC port $VNC_PORT is in use" >&2; exit 1; }
  mkdir -p "$STATE_DIR" "$PROFILE_DIR" "$BACKUP_DIR"
  chmod 700 "$ROOT" "$PROFILE_DIR" "$STATE_DIR" "$BACKUP_DIR"

  password="$(openssl rand -hex 4)"
  umask 077
  x11vnc -storepasswd "$password" "$STATE_DIR/vnc.pass" >/dev/null

  trap 'stop_process chrome || true; stop_process x11vnc || true; stop_process xvfb || true' ERR
  nohup Xvfb "$DISPLAY_VALUE" -screen 0 1440x960x24 -nolisten tcp >"$STATE_DIR/xvfb.log" 2>&1 & echo $! >"$(pid_file xvfb)"
  for _ in $(seq 1 40); do DISPLAY="$DISPLAY_VALUE" xdpyinfo >/dev/null 2>&1 && break; sleep 0.25; done
  DISPLAY="$DISPLAY_VALUE" xdpyinfo >/dev/null

  nohup x11vnc -display "$DISPLAY_VALUE" -localhost -rfbauth "$STATE_DIR/vnc.pass" -forever -shared -rfbport "$VNC_PORT" >"$STATE_DIR/x11vnc.log" 2>&1 & echo $! >"$(pid_file x11vnc)"
  for _ in $(seq 1 40); do ss -ltn | grep -q "127.0.0.1:${VNC_PORT} " && break; sleep 0.25; done
  ss -ltn | grep -q "127.0.0.1:${VNC_PORT} "

  DISPLAY="$DISPLAY_VALUE" nohup "$CHROME_BIN" --user-data-dir="$PROFILE_DIR" --password-store=basic --no-first-run --no-default-browser-check --disable-dev-shm-usage --window-size=1440,960 https://x.com/i/flow/login >"$STATE_DIR/chrome.log" 2>&1 & echo $! >"$(pid_file chrome)"
  sleep 3
  is_running chrome
  trap - ERR
  printf 'VNC_PASSWORD=%s\nVNC_PORT=%s\nDISPLAY=%s\nPROFILE=%s\n' "$password" "$VNC_PORT" "$DISPLAY_VALUE" "$profile_id"
}

stop() {
  stop_process chrome
  backup_profile
  stop_process x11vnc
  stop_process xvfb
  echo 'login session stopped'
}

status() {
  for name in xvfb x11vnc chrome; do if is_running "$name"; then echo "$name=running pid=$(read_pid "$name")"; else echo "$name=stopped"; fi; done
  [[ -d "$PROFILE_DIR" ]] && echo "profile=present" || echo "profile=missing"
}

case "$action" in
  start) start ;;
  stop) stop ;;
  backup) backup_profile ;;
  status) status ;;
  *) echo 'usage: remote-login-session.sh <start|stop|backup|status> <profile>' >&2; exit 1 ;;
esac
