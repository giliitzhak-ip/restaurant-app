# Repository separation plan (proposal; nothing executed)

Status: **proposal only.** No repository was created, nothing was pushed to new repos, and no branch was deleted or rewritten.

## What is in `giliitzhak-ip/restaurant-app` today (checked Oct 20, 2026)

The repository is **public**.
- **`main`** contains only the original restaurant ordering app (`server.js`, `public/`).
- **About 20 other projects** each live on their own branch, usually in their own folder.

| Branch | Folder | Project |
|---|---|---|
| `claude/sahar-face-motion-ai` | `sahar-face-motion-ai/` (+ `.devcontainer/devcontainer.json`) | **SAHAR FACE MOTION AI** (this app) |
| `sahar-ai-studio/phase-1` | `sahar-ai-studio/` | **SAHAR AI STUDIO**: AI music videos with lip-synced characters. A different app. |
| `claude/pingpong-3d` | `pingpong/` | 3D ping-pong game |
| `claude/stanga-street-football-hhlf07` | `stanga/` | street football game |
| `claude/matai-labayit-app-mw0g1n` | `matai-labayit/` | app |
| `claude/cloud-pest-log-2026-arxb20` | `pest-log/` | pest-control log |
| `claude/rpc-catalog-media-system-uf1w2m` | `store/` | catalogue/media |
| `claude/get-service-*`, `claude/luxury-flooring-*`, `claude/pest-control-journal-app-*` | repo root | full apps that replace the root |
| others | `public/` | small games and demos |

**The two SAHAR apps do not overlap:**
- They are in different folders on different branches.
- Both branch off the same `main` commit (`5889b90`).
- No file path is shared.
- Neither branch is merged into `main`.
- `claude/sahar-face-motion-ai` does **not** contain SAHAR AI STUDIO.

## Why separate
- Each app gets its own history, issues, Codespaces configuration and deploy settings.
- The SAHAR apps can be made **private**. The current repo is public, so their code is public.
- Merging `claude/sahar-face-motion-ai` into `restaurant-app/main` would make `main` a mix of two unrelated apps. **Recommendation: do not merge it into `restaurant-app/main`. Move it to its own repo instead.**

## Plan (each step needs your approval)

1. **You** create two empty repositories on github.com, which works from the iPhone: **+ → New repository**.
   - `sahar-face-motion-ai`, Private, with no README.
   - `sahar-ai-studio`, Private, with no README.
2. I extract each app with its full history. This was dry-run locally and works: 4 commits / 148 files for FACE MOTION, and 3 commits / 241 files for AI STUDIO.
   ```bash
   # FACE MOTION (from its branch)
   git subtree split --prefix=sahar-face-motion-ai origin/claude/sahar-face-motion-ai -b split/face-motion
   # AI STUDIO (subtree needs the folder checked out: use a temporary worktree)
   git worktree add --detach /tmp/wt origin/sahar-ai-studio/phase-1
   (cd /tmp/wt && git subtree split --prefix=sahar-ai-studio HEAD -b split/ai-studio)
   git worktree remove /tmp/wt
   ```
3. In the new FACE MOTION repo, add `.devcontainer/devcontainer.json` at the root. It's the same file without the `sahar-face-motion-ai/` path prefix in its two commands.
4. I push `split/face-motion` → `sahar-face-motion-ai:main` and `split/ai-studio` → `sahar-ai-studio:main`. This needs push access to the new repos, which I'll request with `add_repo` after you create them.
5. Verify in the new repos: install, tests, and a Codespace built from `main`.
6. **Only afterwards, and only if you want:**
   - mark the old branches in `restaurant-app` as moved, with a short README note;
   - or delete them.

   Nothing is deleted by this plan. `restaurant-app/main` (the restaurant app) is never touched.

## Not affected
- The restaurant app on `main`, and all other branches.
- The free Codespaces trial. It runs **now** from the branch `claude/sahar-face-motion-ai` and doesn't need any merge or separation first.
