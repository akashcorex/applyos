# Launch Plan — applyos.in

**Goal:** Soft-launch to friends now (landing + auth + dashboard only) → 20 days test & fix → Main public launch.

---

### Phase 1: Soft Launch — Day 0-2 (Now)
**Deploy:** `main` → Vercel (web) + API prod. Enable `EARLY_ACCESS_MODE=true`.

**Must work 100% before invite:**
- [ ] Landing page loads + CTA → login/signup
- [ ] Auth: signup / login / logout / password reset / protected routes
- [ ] Dashboard: loads data, no empty states crash, mobile responsive
- [ ] API + agents health check (`/health`)
- [ ] No console errors, `bun run build:web && build:api` passes

**Invite:** 10-20 friends via private link. No public SEO/indexing.

### Phase 2: Test Period — Day 1-20
**Daily:** Monitor Vercel logs + API errors + DB.

**Collect from friends (Google Form / WhatsApp group):**
- Can you login/signup without help?
- Does dashboard feel fast/clear?
- Any bug / confusing flow?

**Weekly deploys only:** Every Tue/Fri. No random pushes. Hotfix only if auth/dashboard broken.

**Fix priority:**
1. P0 - Auth/dashboard broken → fix < 24h
2. P1 - UX confusion / slow API → fix within week
3. P2 - Landing polish / copy → defer to main launch

**Functionality checks (run weekly):**
- `bun run test` + manual QA: create user → login → dashboard flow
- `fallow health --score` + `fallow audit` — keep health score > 80
- Check agents: job-agent, resume-agent, outreach-agent return expected output

### Phase 3: Pre-Main Launch — Day 15-20
- [ ] Fix all P0/P1 from soft launch feedback
- [ ] Code freeze Day 18 — only bug fixes, no features
- [ ] Final verification: `build`, `test`, Lighthouse >90, auth flow on incognito + mobile
- [ ] Turn off `EARLY_ACCESS_MODE`, enable SEO/meta, analytics
- [ ] Prep: domain, OG images, privacy/terms, support email

### Phase 4: Main Launch — Day 20+
**Deploy:** Day 20 morning (low traffic). Tag `v1.0` in git. Announce after 2h smoke test.

**Deploy Rule Going Forward:**
- `main` = production (auto-deploy). `dev` branch for daily work.
- No direct push to `main`. PR + build pass required.
- Deploy window: Tue-Thu 10am-4pm IST only. Never Fri night.

### Verification Checklist (Use Every Deploy)
**Code:** build passes, no TS errors, env vars set, DB migrate done
**Function:** login → dashboard → logout works, API 200, no 500s in logs for 1h post-deploy

> **Success for soft-launch:** 15+ friends can signup → use dashboard without you helping them. If yes, you're ready for main launch.
