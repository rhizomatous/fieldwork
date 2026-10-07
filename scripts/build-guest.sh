#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
test -f .cache/package/dist/wanix-linux.tgz || npm run assets
node scripts/bundle-agent.ts
docker build --platform linux/386 -f guest/Dockerfile -t agent-in-browser:dev .
container_id=$(docker create --platform linux/386 agent-in-browser:dev)
trap 'docker rm "$container_id" >/dev/null' EXIT
mkdir -p public
docker export "$container_id" | gzip > public/agent-rootfs.tgz.tmp
mv public/agent-rootfs.tgz.tmp public/agent-rootfs.tgz
ls -lh public/agent-rootfs.tgz
