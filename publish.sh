#!/usr/bin/env bash
# Publish NotePannuda to GitHub Pages from your Mac.
#
#   bash publish.sh              creates github.com/<you>/notepannuda and publishes it
#   bash publish.sh my-notes     uses a different repository name
#
# Run it again any time to publish updated files. Needs Git and the GitHub CLI (see README.md).
set -euo pipefail

REPO="${1:-notepannuda}"
cd "$(dirname "$0")"
FILES="notepannuda.html index.html sw.js manifest.webmanifest favicon.ico favicon.svg favicon-16.png favicon-32.png apple-touch-icon.png icon-192.png icon-512.png icon-maskable-512.png logo-96.png badge-96.png shortcut-new.png shortcut-tasks.png"

say() { printf '\n%s\n' "$*"; }
need() { command -v "$1" >/dev/null 2>&1; }

# 1. Tools
if ! need git; then
  say "Git isn't installed. Run this, follow the prompt, then run publish.sh again:"
  echo "  xcode-select --install"; exit 1
fi
if ! need gh; then
  say "The GitHub CLI isn't installed. With Homebrew (https://brew.sh), run:"
  echo "  brew install gh"
  echo "Or download it from https://cli.github.com, then run publish.sh again."; exit 1
fi
for f in $FILES; do
  [ -f "$f" ] || { say "Missing $f. Keep publish.sh in the same folder as all the NotePannuda files."; exit 1; }
done

# 2. Sign in to GitHub (a browser window opens the first time)
if ! gh auth status >/dev/null 2>&1; then
  say "Signing in to GitHub. Follow the steps in your browser."
  gh auth login --web --git-protocol https
fi
gh auth setup-git >/dev/null 2>&1 || true
OWNER="$(gh api user --jq .login)"
SITE_OWNER="$(printf '%s' "$OWNER" | tr '[:upper:]' '[:lower:]')"
say "Signed in as $OWNER."

# 3. Commit the files
touch .nojekyll   # serve the files exactly as they are
[ -d .git ] || git init -q -b main
git add -A
if git -c user.name="$OWNER" -c user.email="$OWNER@users.noreply.github.com" commit -q -m "Publish NotePannuda $(date +%Y-%m-%d)" >/dev/null 2>&1; then
  echo "Committed the current files."
else
  echo "No file changes since the last publish."
fi

# 4. Create the repository, or push to it if it already exists
if gh repo view "$OWNER/$REPO" >/dev/null 2>&1; then
  git remote get-url origin >/dev/null 2>&1 || git remote add origin "https://github.com/$OWNER/$REPO.git"
  say "Uploading to github.com/$OWNER/$REPO ..."
  git push -q -u origin main
else
  say "Creating github.com/$OWNER/$REPO and uploading ..."
  gh repo create "$REPO" --public --source=. --remote=origin --push \
    --description "NotePannuda: jot first, organize later. Notes and tasks that sync directly between your devices."
fi

# 5. Turn on GitHub Pages (main branch, root folder)
if ! gh api "repos/$OWNER/$REPO/pages" >/dev/null 2>&1; then
  echo '{"source":{"branch":"main","path":"/"}}' | gh api -X POST "repos/$OWNER/$REPO/pages" --input - >/dev/null
  echo "GitHub Pages is on."
fi

# 6. Wait for the site
URL="https://$SITE_OWNER.github.io/$REPO/notepannuda.html"
say "Waiting for GitHub Pages to publish (usually 1 to 2 minutes) ..."
status=""
for _ in $(seq 1 30); do
  status="$(gh api "repos/$OWNER/$REPO/pages" --jq '.status // ""' 2>/dev/null || true)"
  [ "$status" = "built" ] && break
  [ "$status" = "errored" ] && break
  sleep 10
done
case "$status" in
  built)   say "Published! Open NotePannuda at:"; echo "  $URL" ;;
  errored) say "GitHub Pages reported an error. Check Settings > Pages at https://github.com/$OWNER/$REPO/settings/pages"; exit 1 ;;
  *)       say "Still publishing. It should be ready in a minute or two at:"; echo "  $URL" ;;
esac
