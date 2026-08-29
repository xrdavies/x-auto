#!/usr/bin/env bash

set -euo pipefail

NODE_VERSION="${X_AUTO_NODE_VERSION:-24.15.0}"
NODE_DIR="$HOME/.local/node-v${NODE_VERSION}-linux-x64"

[[ "$(uname -m)" == x86_64 ]] || { echo 'x-auto remote install currently requires x86_64' >&2; exit 1; }
command -v sudo >/dev/null || { echo 'sudo is required' >&2; exit 1; }
sudo -n true >/dev/null 2>&1 || { echo 'passwordless sudo is required for unattended install' >&2; exit 1; }

sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ca-certificates curl openssl rsync xvfb x11vnc x11-utils

if ! command -v google-chrome-stable >/dev/null 2>&1; then
  temp_dir="$(mktemp -d)"
  trap 'rm -rf "$temp_dir"' EXIT
  chrome_deb="$temp_dir/google-chrome-stable.deb"
  curl -fL --retry 3 -o "$chrome_deb" https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "$chrome_deb"
  rm -rf "$temp_dir"
  trap - EXIT
fi

if [[ ! -x "$NODE_DIR/bin/node" ]]; then
  temp_dir="$(mktemp -d)"
  trap 'rm -rf "$temp_dir"' EXIT
  archive="node-v${NODE_VERSION}-linux-x64.tar.xz"
  curl -fsSLo "$temp_dir/$archive" "https://nodejs.org/dist/v${NODE_VERSION}/$archive"
  curl -fsSLo "$temp_dir/SHASUMS256.txt" "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt"
  (cd "$temp_dir" && grep " $archive$" SHASUMS256.txt | sha256sum -c -)
  mkdir -p "$HOME/.local"
  tar -xJf "$temp_dir/$archive" -C "$HOME/.local"
  rm -rf "$temp_dir"
  trap - EXIT
fi

export PATH="$NODE_DIR/bin:$PATH"
corepack enable
corepack prepare pnpm@10.34.1 --activate
mkdir -p "$HOME/.x-auto/profiles" "$HOME/.x-auto/backups" "$HOME/.x-auto/state"
chmod 700 "$HOME/.x-auto" "$HOME/.x-auto/profiles" "$HOME/.x-auto/backups" "$HOME/.x-auto/state"

printf 'node=%s\npnpm=%s\nchrome=%s\n' "$(node -v)" "$(pnpm -v)" "$(google-chrome-stable --version)"
