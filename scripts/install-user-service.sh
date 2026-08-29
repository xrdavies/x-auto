#!/usr/bin/env bash

set -euo pipefail

profile_id="${1:-}"
handle="${2:-}"
source="${3:-source}"
[[ "$profile_id" =~ ^[a-z0-9][a-z0-9_-]{0,63}$ ]] || { echo 'invalid profile id' >&2; exit 1; }
[[ "$handle" =~ ^@?[A-Za-z0-9_]{1,15}$ ]] || { echo 'invalid X handle' >&2; exit 1; }
[[ "$source" == source || "$source" == npm ]] || { echo 'invalid source' >&2; exit 1; }

if [[ "$source" == npm ]]; then
  repo_dir="${X_AUTO_PACKAGE_DIR:-$HOME/.local/x-auto/current}"
else
  repo_dir="${X_AUTO_REPO_DIR:-$HOME/x-auto}"
fi
node_dir="${X_AUTO_NODE_DIR:-$HOME/.local/node-v24.15.0-linux-x64/bin}"
config_dir="$HOME/.config/x-auto"
unit_dir="$HOME/.config/systemd/user"
socket_path="$HOME/.x-auto/state/${profile_id}.sock"
mkdir -p "$config_dir" "$unit_dir"
chmod 700 "$config_dir"
[[ -f "$repo_dir/dist/server.js" ]] || { echo "x-auto runtime not found: $repo_dir" >&2; exit 1; }

cat >"$config_dir/${profile_id}.env" <<EOF
X_AUTO_PROFILE=$profile_id
X_AUTO_HANDLE=${handle#@}
X_AUTO_SOCKET=$socket_path
EOF
chmod 600 "$config_dir/${profile_id}.env"

cat >"$unit_dir/x-auto@.service" <<EOF
[Unit]
Description=x-auto publisher for %i
After=network-online.target

[Service]
Type=simple
UMask=0077
NoNewPrivileges=true
EnvironmentFile=%h/.config/x-auto/%i.env
Environment=PATH=$node_dir:/usr/local/bin:/usr/bin:/bin
WorkingDirectory=$repo_dir
ExecStart=$node_dir/node $repo_dir/dist/server.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable "x-auto@${profile_id}.service"
if sudo -n true >/dev/null 2>&1; then sudo loginctl enable-linger "$USER"; fi
echo "installed=x-auto@${profile_id}.service"
