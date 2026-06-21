# web

`web` is the Next.js frontend (port 3000). It provides the user interface for authentication and the post-login dashboard for managing outreach automation workflows.

**Status: early stage** — auth scaffolding is wired. Core outreach features are pending implementation.

## What it does

- **Authentication** — login/signup with email/password or LinkedIn OAuth (via better-auth)
- **Dashboard** — post-login landing page showing session info, user profile, and account actions
- **Future** — job management, workflow creation, outreach campaign monitoring, and analytics

## Routes

| Path | Page | Description |
|------|------|-------------|
| `/` | Redirect to `/login` | Landing page |
| `/login` | Login form | Email/password sign-in + LinkedIn OAuth button |
| `/signup` | Signup form | Name/email/password registration |
| `/dashboard` | Dashboard | Protected — shows user info, session details, sign-out |

## Tech stack

- **Next.js 16** (App Router) + **React 19**
- **Tailwind CSS 3.4** for styling
- **better-auth** client for auth

## API connectivity

All auth operations are proxied to the Express API at `http://localhost:3333` (configurable via `NEXT_PUBLIC_API_URL`).

## Run locally

From the repository root:

```bash
bun nx run web:dev
```

The app will be available at `http://localhost:3000`.
