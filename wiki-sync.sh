#!/bin/sh
# Two-way git sync for ~/.hermes/wiki ↔ its private GitHub remote.
# Launched every 60s by ~/Library/LaunchAgents/com.hermy.wiki-sync.plist.
#
# Flow each run:
#   1. commit any pending local changes (bridge/dashboard/hermes-agent writes)
#   2. pull --rebase remote edits (github.dev / phone edits)
#   3. push
# A lockdir prevents overlapping runs; failures are retried next tick.

WIKI="$HOME/.hermes/wiki"
LOCK="/tmp/hermes-wiki-sync.lock"
LOG="$HOME/.hermes/wiki-sync.log"
BRANCH="main"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG"; }

mkdir "$LOCK" 2>/dev/null || exit 0
trap 'rmdir "$LOCK"' EXIT INT TERM

cd "$WIKI" || exit 1

# 1. commit local work, if any
if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
  git add -A
  if git commit -m "wiki: auto-sync $(date '+%Y-%m-%d %H:%M')" >/dev/null 2>&1; then
    log "committed local changes"
  fi
fi

# 2. integrate remote edits
if ! git pull --rebase origin "$BRANCH" >/dev/null 2>&1; then
  git rebase --abort >/dev/null 2>&1
  log "WARN rebase conflict — left local commits in place, will retry after manual resolution"
fi

# 3. publish
if git push origin "$BRANCH" >/dev/null 2>&1; then
  log "synced with origin/$BRANCH"
fi
