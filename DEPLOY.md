# Vercel Deployment Guide for ApplySo

## Prerequisites
- Vercel account (free tier works fine)
- Your code pushed to GitHub/GitLab/Bitbucket (recommended for auto-deploys)

---

## Method 1: Vercel Dashboard (Recommended — Auto-deploy on git push)

### Step 1: Import Project
1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your Git repository (`applyso.in`)

### Step 2: Configure Project Settings
Use **these exact settings** (Nx monorepo requires custom config):

| Setting | Value |
|---|---|
| **Framework Preset** | `Next.js` |
| **Root Directory** | `.` (leave empty / repo root) |
| **Build Command** | `bun nx build web` |
| **Output Directory** | `apps/web/.next` |
| **Install Command** | `bun install` |

> **Why root directory `.`?** Because it's a monorepo. `apps/web` depends on `packages/ui` and `packages/database`. If you set root to `apps/web`, the workspace packages won't resolve and the build will fail.

### Step 3: Environment Variables
Add any required env vars in the Vercel dashboard under **Settings → Environment Variables**:
- `DATABASE_URL` (if your frontend calls API routes that need it)
- `NEXT_PUBLIC_*` vars for client-side config
- Any auth-related secrets

### Step 4: Deploy
Click **Deploy**. First deploy takes ~2-3 minutes.

---

## Method 2: Vercel CLI (One-off deploys)

### Step 1: Install CLI
```bash
bun add -g vercel
# or: npm i -g vercel
```

### Step 2: Login
```bash
vercel login
```
Opens browser — authorize with your Vercel account.

### Step 3: Link Project (first time only)
From the **repo root** (`/Users/akashlaha/Documents/Projects/applyso.in`):
```bash
vercel
```
Follow prompts:
- Set up and deploy? **Yes**
- Which scope? Pick your Vercel team/personal account
- Link to existing project? **No** (or Yes if you created one in dashboard)
- Project name: `applyso-web` (or whatever you want)

### Step 4: Deploy
```bash
# Preview deploy (every push gets a URL)
vercel

# Production deploy
vercel --prod
```

> **Important:** Always run `vercel` from the **repo root**, not from `apps/web/`. The CLI reads your root `package.json` and `nx.json` to resolve the monorepo workspace dependencies correctly.

---

## Method 3: Build Locally, Deploy Dist (Advanced)

If you want to test the production build locally first:

```bash
# 1. Build the web app
bun nx build web

# 2. Deploy the built output
vercel --cwd apps/web dist
```

> Note: This requires the app to be fully static or self-contained. With API routes and workspace deps, Method 1 or 2 is safer.

---

## Troubleshooting

### "Cannot find module '@org/ui'" during build
→ You set Root Directory to `apps/web` instead of `.`. Change it to `.` so Vercel installs workspace packages.

### "bun: command not found" on Vercel
→ Vercel auto-detects Bun if you have a `bun.lockb` file. If not, switch Install Command to `npm install` or `pnpm install` and Build Command to `npx nx build web`.

### Build succeeds but page shows 404
→ Check Output Directory is `apps/web/.next` (not `.next` or `dist`).

### Want a custom domain?
→ After first deploy, go to Project Settings → Domains → Add your domain (`applyso.in`).

---

## Quick Reference

```bash
# One-liner production deploy (after CLI login + project linked)
vercel --prod

# With custom env vars for this deploy only
vercel --prod -e DATABASE_URL=your_db_url
```
