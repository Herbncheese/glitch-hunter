#!/usr/bin/env bash
# Publish scan JSON to the scanner-data branch, and keep the default branch
# active at least once a day (or immediately when a new watch-rule match is recorded).
# Never prints DISCORD_WEBHOOK_URL. Refuses to commit if a webhook leaked into data/.
set -euo pipefail

DATA_DIR="${DATA_DIR:-data}"
LIVE_BRANCH="${LIVE_BRANCH:-scanner-data}"
MAIN_BRANCH="${MAIN_BRANCH:-main}"
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
PT="$(node --input-type=module -e 'import fs from "node:fs"; const s = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); console.log(s.scannedAtPT || "");' "${DATA_DIR}/latest-scan.json")"
NEW_COUNT="$(node --input-type=module -e 'import fs from "node:fs"; const s = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); console.log(Number(s.newMatchCount || 0));' "${DATA_DIR}/latest-scan.json")"
DELIVERY="$(node --input-type=module -e 'import fs from "node:fs"; const s = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); console.log(s.discordDelivery || "none");' "${DATA_DIR}/latest-scan.json")"
MATCH_COUNT="$(node --input-type=module -e 'import fs from "node:fs"; const s = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); console.log(Array.isArray(s.deals) ? s.deals.length : 0);' "${DATA_DIR}/latest-scan.json")"
BASELINE="$(node --input-type=module -e 'import fs from "node:fs"; const s = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); console.log(s.baselineComplete ? "true" : "false");' "${DATA_DIR}/latest-scan.json")"

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
        if [ "$branch" = "$MAIN_BRANCH" ]; then
          write_activity "$work" "${4:-heartbeat}"
        fi
        git -C "$work" add data
        git -C "$work" commit -m "$message" || true
      fi
    fi
    sleep $((attempt * 2))
  done
  echo "Failed to push ${branch}."
  return 1
}

write_activity() {
  local work="$1"
  local because="$2"
  mkdir -p "${work}/data"
  node --input-type=module - "$work" "$because" "$STAMP" "$PT" "$MATCH_COUNT" "$NEW_COUNT" "$DELIVERY" "$BASELINE" "$LIVE_BRANCH" <<'NODE'
import fs from 'node:fs';
const [work, because, scannedAt, scannedAtPT, matchCount, newMatchCount, discordDelivery, baselineComplete, liveBranch] = process.argv.slice(2);
const payload = {
  lastScanAt: scannedAt,
  lastScanAtPT: scannedAtPT,
  matchCount: Number(matchCount),
  newMatchCount: Number(newMatchCount),
  discordDelivery,
  baselineComplete: baselineComplete === 'true',
  updatedBecause: because,
  liveBranch,
};
fs.writeFileSync(`${work}/data/activity.json`, JSON.stringify(payload, null, 2) + '\n');
NODE
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

git fetch origin "$MAIN_BRANCH"
MAIN_WORK="$(mktemp -d)"
git worktree add --detach "$MAIN_WORK" "origin/${MAIN_BRANCH}"

NEED_MAIN=0
REASON="heartbeat"
if [ "$NEW_COUNT" != "0" ] && [ "$DELIVERY" != "skipped-baseline" ]; then
  NEED_MAIN=1
  REASON="rule-hit"
fi
if [ -f "${MAIN_WORK}/data/activity.json" ]; then
  AGE="$(node --input-type=module -e 'import fs from "node:fs"; const a = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); const t = Date.parse(a.lastScanAt || ""); const age = Number.isNaN(t) ? 99999999 : Math.floor((Date.now() - t) / 1000); console.log(age);' "${MAIN_WORK}/data/activity.json")"
else
  AGE=99999999
fi
if [ "$AGE" -ge 86400 ]; then
  NEED_MAIN=1
  if [ "$REASON" != "rule-hit" ]; then
    REASON="heartbeat"
  fi
fi

if [ "$NEED_MAIN" = "1" ]; then
  copy_scan_files "$MAIN_WORK"
  write_activity "$MAIN_WORK" "$REASON"
  if [ "$REASON" = "rule-hit" ]; then
    MSG="scan: record ${NEW_COUNT} new watch-rule match(es)"
  else
    MSG="chore: keep scheduled scanner active"
  fi
  # commit_and_push reads the 4th argument only on the rebase fallback path.
  commit_and_push "$MAIN_BRANCH" "$MSG" "$MAIN_WORK" "$REASON"
else
  echo "Default branch activity is fresh (${AGE}s since last heartbeat). Skipped main commit."
fi

git worktree remove --force "$MAIN_WORK" || true
git worktree prune || true
echo "State publish finished."
