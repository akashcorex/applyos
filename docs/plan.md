# ApplyOS — work plan

**Done: 42%**  
**Left: 58%**

Today: a user can sign up (email or Google), upload a resume, get a profile, search/apply via agents. Admin is USER / ADMIN only (users + resumes).  
Not done: permissions, real job catalog, job prefs, contacts, outreach channels, LinkedIn/email integrations, billing, audit log, full admin watch.

---

## Phase 1 — Account, roles, profile, resume

Finish identity and the first user loop.

- Keep USER and ADMIN. Add a permission layer so we can add SUPPORT later without rewriting APIs.
- Server always checks role. UI hide is not security.
- Profile confirm + multiple resumes stay the path after login.
- Onboarding: sign up → resume → confirm profile. Nothing else required.

Done when: Google/email login, resume extract, profile save, admin cannot be skipped by a USER.

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
- Audit log for admin changes (suspend, role change, refund).

Done when: admin can answer “how many applied, failed, paid, connected LinkedIn?” without opening the database.

---

## Two-person log

| | Person A | Person B |
|---|---|---|
| Name | ________________ | ________________ |
| Share of the 58% left | ____ % | ____ % |
| What I finished | | |
| Blocked on | | |
| Remarks | | |

---

## To-do (tick and put A or B)

**Phase 1**
- [ ] Permission checks on APIs (not only `role === ADMIN`) — ___
- [ ] Admin page blocked for USER on server + UI — ___
- [ ] Resume upload → extract → confirm profile, end to end — ___
- [ ] Remarks: ________________________________

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
