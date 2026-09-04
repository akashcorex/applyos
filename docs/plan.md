# ApplyOS — work plan

**Done: 55%**  
**Left: 45%**

Today: Phase 1 is done. A user signs up (email/Google), is walked through onboarding (upload resume → extraction → confirm profile), and lands on the dashboard. Authorization is a capability layer (`requirePermission`), always checked server-side. Admin mutations (role change, suspend, delete) revoke the target's sessions and write an audit log. Users can search/apply via agents.  
Not done: real job catalog, job prefs, contacts, outreach channels, LinkedIn/email integrations, billing, full admin watch, password reset.

---

## Phase 1 — Account, roles, profile, resume ✅ DONE

Finish identity and the first user loop.

- Keep USER and ADMIN. Add a permission layer so we can add SUPPORT later without rewriting APIs.
- Server always checks role. UI hide is not security.
- Profile confirm + multiple resumes stay the path after login.
- Onboarding: sign up → resume → confirm profile. Nothing else required.

Done when: Google/email login, resume extract, profile save, admin cannot be skipped by a USER.

What shipped:
- `apps/api/src/lib/permissions.ts` — role → capability map + `requirePermission(cap)` middleware; SUPPORT later = one entry.
- Fail-closed authz (`authz.ts`) — DB read failure denies, never falls back to session-embedded role.
- Admin mutations hardened (`admin.ts`) — self role/status change blocked, last-admin guard kept, suspend/delete revokes sessions + syncs Better Auth `banned`, every mutation logged to `audit_logs` (no FKs — rows survive user deletion).
- Onboarding loop — `/v1/me` returns onboarding state; web `proxy.ts` (Next 16 middleware) forces signup → `/onboarding` (upload → extract → confirm) before `/dashboard`; `useAdminGuard` + proxy block USERs from `/dashboard/admin`.
- Profile semantics — save ≠ confirm; only explicit confirm locks a profile against future extractions.
- Security fixes — `/api/linkedin-session` + `/api/workflows` GET session-gated, client `user_id` dropped from resume parse, dead forgot-password link removed.

## Phase 2 — Jobs, preferences, applications

Make apply the main product.

- Job preferences: titles, locations, remote, salary (fill later, not all at signup).
- Jobs as their own records (not only inside a workflow run).
- Applications: one row per user + job, with a real status path (applying → submitted → failed / interview / offer).

Done when: a user can set prefs, see jobs, and track every apply from the dashboard.

## Phase 3 — Outreach and connections

LinkedIn and email as one outreach system.

- Contacts (recruiter / HM / other), not mixed into User.
- One outreach record: channel + type + status (draft → sent → replied).
- LinkedIn connection and email connection as integrations. Never store those passwords.
- “I want LinkedIn outreach” is not the same as “LinkedIn is connected.”

Done when: after an apply, we can recommend and send LinkedIn or email outreach with a visible status.

## Phase 4 — Billing, analytics, full admin

Watch the business and get paid.

- Subscription + payment (Stripe owns cards). No card data in our DB.
- Product clicks/funnels go to an analytics tool. Postgres keeps only real business state.
- Admin sees: users, profiles, resumes, jobs, applications, outreach, connections, billing, errors.
- Audit log for admin changes (suspend, role change, refund). — *started in Phase 1: `audit_logs` table + role/status mutations logged; refunds etc. extend it.*

Done when: admin can answer “how many applied, failed, paid, connected LinkedIn?” without opening the database.

---

## Two-person log

| | Person A | Person B |
|---|---|---|
| Name | ________________ | ________________ |
| Share of the 45% left | ____ % | ____ % |
| What I finished | | |
| Blocked on | | |
| Remarks | | |

---

## To-do (tick and put A or B)

**Phase 1**
- [x] Permission checks on APIs (not only `role === ADMIN`) — capability layer (`requirePermission`), fail-closed authz, session revocation + audit log on admin mutations
- [x] Admin page blocked for USER on server + UI — `/dashboard/admin` gated in `proxy.ts` (server) + `useAdminGuard`; `requirePermission` on every admin API
- [x] Resume upload → extract → confirm profile, end to end — `/onboarding` flow (signup → upload → extract → confirm), enforced by `proxy.ts`; profile save ≠ confirm
- [ ] Remarks: verified live (53 bun tests + E2E smoke). Archived-resume edge fixed (hasResume = ever uploaded). Password reset + SUPPORT role deferred. Known leftovers: billing/security/dashboard-overview pages are mocks, hardcoded localhost agent URLs in some BFF routes, no rate limiting.

**Phase 2**
- [ ] Job preferences screen + save — ___
- [ ] Shared job list (deduped) — ___
- [ ] Application statuses on dashboard — ___
- [ ] Remarks: ________________________________

**Phase 3**
- [ ] Contact list per company — ___
- [ ] Outreach row (LinkedIn / email) with status — ___
- [ ] Connect LinkedIn (OAuth, no password) — ___
- [ ] Connect email (OAuth, no password) — ___
- [ ] Remarks: ________________________________

**Phase 4**
- [ ] Plans + checkout — ___
- [ ] Admin: users, jobs, applies, outreach, billing — ___
- [ ] Audit log for admin actions — ___
- [ ] Remarks: ________________________________
