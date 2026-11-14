#!/usr/bin/env bash
# Publish scan JSON to the scanner-data branch only.
# Do not commit to main. A github-actions[bot] commit on the default branch
# becomes the schedule actor and scheduled runs stop queuing. scanner-data
# commits are enough repository activity to keep the 60-day schedule alive.
# Never prints DISCORD_WEBHOOK_URL. Refuses to commit if a webhook leaked into data/.
set -euo pipefail

DATA_DIR="${DATA_DIR:-data}"
LIVE_BRANCH="${LIVE_BRANCH:-scanner-data}"
FILES=(seen-alerts.json alerts-history.json latest-scan.json rejections.json)

if [ ! -f "${DATA_DIR}/latest-scan.json" ]; then
  echo "Missing ${DATA_DIR}/latest-scan.json. Run npm run scan first."
  exit 1
fi

if [ -n "${DISCORD_WEBHOOK_URL:-}" ] && grep -R -F -q -- "$DISCORD_WEBHOOK_URL" "$DATA_DIR"; then
  echo "Refusing to publish: DISCORD_WEBHOOK_URL appeared in ${DATA_DIR}/."
  exit 1
fi
if grep -R -E -q -i 'discord(app)?\.com/api/webhooks/[0-9]+/' "$DATA_DIR"; then
  echo "Refusing to publish: a Discord webhook URL appeared in ${DATA_DIR}/."
  exit 1
fi

echo "Scan data has no webhook URL."

if [ "${GITHUB_ACTIONS:-}" != "true" ]; then
  echo "Not running in GitHub Actions; secret check passed and git publish was skipped."
  exit 0
fi

export GIT_AUTHOR_NAME="${GIT_AUTHOR_NAME:-github-actions[bot]}"
export GIT_AUTHOR_EMAIL="${GIT_AUTHOR_EMAIL:-41898282+github-actions[bot]@users.noreply.github.com}"
export GIT_COMMITTER_NAME="$GIT_AUTHOR_NAME"
export GIT_COMMITTER_EMAIL="$GIT_AUTHOR_EMAIL"

STAMP="$(node --input-type=module -e 'import fs from "node:fs"; const s = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); console.log(s.scannedAt || new Date().toISOString());' "${DATA_DIR}/latest-scan.json")"

copy_scan_files() {
  local dest="$1"
  mkdir -p "${dest}/data"
  local name
  for name in "${FILES[@]}"; do
    cp -f "${DATA_DIR}/${name}" "${dest}/data/${name}"
  done
}

commit_and_push() {
  local branch="$1"
  local message="$2"
  local work="$3"
  git -C "$work" add data
  if git -C "$work" diff --cached --quiet; then
    echo "No changes to publish on ${branch}."
    return 0
  fi
  git -C "$work" commit -m "$message"
  local attempt
  for attempt in 1 2 3 4; do
    if git -C "$work" push origin "HEAD:${branch}"; then
      echo "Pushed ${branch}."
      return 0
    fi
    echo "Push to ${branch} rejected (attempt ${attempt}). Rebasing onto origin/${branch}."
    git -C "$work" fetch origin "$branch" || true
    if git -C "$work" show-ref --verify --quiet "refs/remotes/origin/${branch}"; then
      if ! git -C "$work" rebase "origin/${branch}"; then
        git -C "$work" rebase --abort || true
        git -C "$work" reset --hard "origin/${branch}"
        copy_scan_files "$work"
        git -C "$work" add data
        git -C "$work" commit -m "$message" || true
      fi
    fi
    sleep $((attempt * 2))
  done
  echo "Failed to push ${branch}."
  return 1
}

git fetch origin "$LIVE_BRANCH" || true
LIVE_WORK="$(mktemp -d)"
if git show-ref --verify --quiet "refs/remotes/origin/${LIVE_BRANCH}"; then
  git worktree add --detach "$LIVE_WORK" "origin/${LIVE_BRANCH}"
else
  git worktree add -b "$LIVE_BRANCH" "$LIVE_WORK" HEAD
fi
copy_scan_files "$LIVE_WORK"
commit_and_push "$LIVE_BRANCH" "scan: ${STAMP}" "$LIVE_WORK"
git worktree remove --force "$LIVE_WORK" || true
git worktree prune || true
echo "State publish finished. scanner-data updated. main was not changed."
