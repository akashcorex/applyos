# ApplyOS — Go-To-Market Playbook (v1.0)

> **Doc owner:** Akash · **Written:** 27 Oct 2026 · **Reconciled with product:** 27 Oct 2026 (v1.1 — Dodo confirmed as gateway, plan table = shipped reality, claims register aligned) · **Status:** Draft for launch planning
> **Audience:** (1) the ApplyOS agent that executes tasks, (2) the founding team.
> **Primary market:** India (Gen Z freshers / early-career devs). **Secondary:** remote/global early-career.
> **Product stage:** Beta. Core MVP built; not yet ready for a polished public launch (see §1.3 gates).

---

## 0. How the agent must use this document

1. **This file is the source of truth for positioning, claims, pricing and launch tasks.** If any copy, page, post or email conflicts with this file, this file wins. If this file conflicts with the actual product behavior, **the product wins and this file must be updated first.**
2. **Claims discipline (non-negotiable).** Only use claims from §6 "Allowed now". Anything under "Conditional" needs a real number from our own data. Anything under "Banned" never ships. When unsure, don't claim it.
3. **Placeholders** in `[BRACKETS]` must be filled from the repo/product before publishing:
   - `[SUPPORTED_BOARDS]` — the exact list of job-board/ATS systems automation really works on today (take from the codebase, not from memory).
     - _Draft from code (27 Oct 2026, pending A1 success-rate analysis):_ apply automation targets **Greenhouse, Workday, Lever, Ashby, Workable, Wellfound** + a generic LLM fallback for other forms. Discovery covers 10 ATS parsers (adds Recruitee, Personio, Teamtailor, Breezy, Rippling) + 7 aggregator feeds (RemoteOK, Remotive, WWR, Himalayas, Jobicy, HN, a16z). A LinkedIn Easy Apply adapter exists but is unmarketed — see the §6.3 open decision.
   - `[SUPPORT_EMAIL]`, `[FOUNDER_X_HANDLE]`, `[INSTAGRAM_HANDLE]`, `[DISCORD_INVITE]`.
   - `[COST_PER_SUBMITTED_APP]` — measured in beta (see §8.7).
4. **Task format.** Work from the backlog in §16. Each task has an ID, owner (`AGENT` / `HUMAN` / `ENG`), and an acceptance test. Mark done only when the acceptance test passes. Log results in a `LAUNCH_LOG.md` (date, task ID, outcome, link).
5. **Never publish, send, spend money, post publicly or email real users without a `HUMAN` approval** unless the task explicitly says `AGENT-AUTONOMOUS`.
6. **Tone:** direct, fast, a little playful, never hype-y or fake-urgent. See §9.

---

## 1. Product snapshot (ground truth)

### 1.1 What ApplyOS is

An AI job-search assistant that turns a resume into a candidate profile, finds and ranks relevant jobs, tailors the resume per job, helps submit applications, and tracks progress — with a human able to step in live when automation gets stuck.

### 1.2 What works today (can be marketed)

| Capability                                                       | State                                                                     |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Sign-up / login                                                  | Working                                                                   |
| Resume upload + profile confirmation (user approves the profile) | Working                                                                   |
| Job discovery + matching                                         | Working                                                                   |
| Tailored resume generation (per job)                             | Working                                                                   |
| Application automation on several job-board systems              | Working (draft list in §0.3; formal `[SUPPORTED_BOARDS]` = A1)            |
| LinkedIn connection requests to recruiters                       | Working ("LinkedIn Connects"; message sending does not — see §1.3)        |
| Human review / live browser takeover when needed                 | Working                                                                   |
| Application tracking                                             | Working                                                                   |
| Subscription + application quota (30-day cycle, top-ups)         | Built on **Dodo Payments**; **test mode — live billing not yet verified** |

### 1.3 What is NOT done (must not be marketed as available)

- Outreach sending — email/DM send endpoint returns 501 (LinkedIn _connection requests_ do send; messages do not)
- Follow-up drafts, reply sync
- Cover letters
- Stronger resume checks
- Job-posting verification (ghost/fake-job detection)
- Fuller notifications and status tracking

### 1.4 Launch readiness gates (Gate 0 — must pass before ANY paid traffic)

| #   | Gate                                                                                                  | Owner       | Done when                                                                                                                                                              |
| --- | ----------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | Live billing verified (Dodo live mode — UPI + cards, webhooks, refunds, MoR tax invoices)             | ENG         | A real ₹ payment grants applications, the webhook records it, a refund reverses it (note: Dodo UPI may support full refunds only — verify), a Dodo tax invoice arrives |
| G2  | Resume files moved from local disk to durable storage (S3/R2-class) with backups                      | ENG         | Redeploy + container wipe loses zero resumes                                                                                                                           |
| G3  | Monitoring + alerting (errors, queue depth, automation success rate, payment failures)                | ENG         | Alert fires in a test, on-call knows who gets it                                                                                                                       |
| G4  | Automation safeguards: per-user daily caps, rate limits, match-score threshold, kill switch per board | ENG         | Kill switch disables a board in <5 min, tested                                                                                                                         |
| G5  | Privacy basics: consent notice, privacy policy, delete-my-data, 18+ gate, breach runbook (see §14)    | ENG + HUMAN | Delete request wipes resume, profile, artifacts, logs of PII                                                                                                           |
| G6  | "Application only on submitted" logic verified end-to-end                                             | ENG         | Failed / stuck / cancelled app = 0 quota used (extend the existing first-transition test with negative cases)                                                          |
| G7  | Support path (email + Discord) staffed with a response SLA                                            | HUMAN       | Test ticket answered inside SLA                                                                                                                                        |

**Rule:** no public launch until G1–G7 are green. Closed beta may start after G2, G4, G5 and G6.

---

## 2. Market context & why now

_(Figures are from public reports; re-verify before putting them in ads. Sources in §17.)_

- **India's job search is crowded and stressful.** LinkedIn India research: 84% of professionals feel unprepared to find a job in 2026, 72% plan to look, 76% say it's harder, and applicants per job have roughly doubled. 94% plan to use AI in their search.
- **Fresher demand exists but is uneven.** TeamLease EdTech HY2 2026: 75% of employers plan to hire freshers (up from 73%), but IT hiring intent fell from 81% to 76% while e-commerce/tech start-ups and retail sit at 93%. Bengaluru leads at 89%. Take-away: _freshers must apply broadly across startups and non-IT tech roles, not only service companies_ → a discovery + matching engine is genuinely useful.
- **Employers favor proof of skill.** Internships and project portfolios move candidates faster than degree-only applicants → tailoring resumes to surface projects matters.
- **Gen Z priorities:** learning/growth is the top first-job motivator (60–65%), and ~27% of candidates drop out of hiring processes over a lack of pay transparency → transparency is a brand fit for us.
- **Competitors validate demand** (paid tiers around $9–$40/month) but most are US-centric, priced in USD, and many get criticized as "spray-and-pray" bots.

**Opportunity:** an _India-first, mobile-friendly, ₹-priced, UPI-payable_ job-application copilot that keeps the user in control and never charges for applications that didn't actually go out.

---

## 3. Competitor landscape & pricing anchors

_Prices are "as reported" by third-party roundups in 2026 and change often. Re-check live pricing pages before every pricing decision._

| Product          | What it is                        | Reported pricing                                    | Takeaway for us                                             |
| ---------------- | --------------------------------- | --------------------------------------------------- | ----------------------------------------------------------- |
| Simplify         | Autofill + tracker + AI tailoring | Free tier; Simplify+ ~$19/mo                        | Free autofill is the bar; we must be better at _end-to-end_ |
| Tsenta (YC)      | AI auto-apply, dashboard          | ~25 free applications; paid from ~$19/mo            | Closest in shape; US-centric, USD                           |
| Jobright         | AI job copilot + auto-apply       | Free tier; paid ~ $30/mo                            | Strong free tier                                            |
| AIApply          | Tailoring + auto-apply + toolkit  | ~$29–33/mo; credits 1 = 1 application, never expire | Credit model is accepted by users                           |
| LoopCV           | Passive automation                | Free: 1 job title, 10 applications/mo; paid tiers   | Free-forever anchor: 10 apps/mo                             |
| LazyApply        | Bulk apply                        | ~$99–$999/yr                                        | Reputation for spray-and-pray                               |
| JobCopilot       | Wide auto-apply                   | ~$8.90/week                                         | Weekly billing exists; feels expensive over a month         |
| Teal             | Tracker + AI resume               | Free; Teal+ ~ $9/week                               | Tracking is a commodity                                     |
| LinkedIn Premium | Passive tools                     | ~$39.99/mo                                          | Too expensive for freshers                                  |

**Where we win:** (1) India pricing & UPI, (2) human takeover instead of black-box bots, (3) pay-per-submitted-application, (4) confirmed profile → better matches, (5) per-job tailored resume PDF.
**Where we lose today:** cover letters, outreach, brand awareness, number of boards. _Do not hide this; just don't claim it._

---

## 4. Target customers (ICP)

### 4.1 Primary — "The Final-Year Grinder"

- Final-year / just-graduated B.Tech, BCA, MCA, B.Sc CS/IT in India, including **Tier 2/3 colleges** where campus placement is thin.
- Applies to 50–300 roles, has no referrals, hates repeating the same forms.
- Pays with **UPI**, price-sensitive (₹300–₹1,000 is "okay", ₹2,000+ needs a reason), mobile-first, lives on Instagram / YouTube / WhatsApp / Discord / X.
- Job to be done: _"Get me interviews without losing my weekends to forms."_

### 4.2 Secondary — "The 0–2 Year Switcher"

- Dev with 0–2 years' experience wanting a better role/startup/remote job; applies quietly while working.
- Job to be done: _"Find good roles and apply fast without me babysitting."_

### 4.3 Tertiary (later) — Colleges / bootcamps (B2B seats), non-tech freshers.

### 4.4 Anti-ICP (don't spend on)

Senior/executive search, people wanting thousands of blind applications per day, anyone needing LinkedIn auto-apply.

---

## 5. Positioning

### 5.1 Category

**AI job-application copilot** (not "bot"). We're the _"apply smart, not spray"_ alternative to bulk auto-apply.

### 5.2 Positioning statement

> For early-career developers in India who are tired of repeating the same forms and getting ignored, **ApplyOS** is the AI job-search copilot that builds your profile from your resume, finds roles that fit, tailors your resume for each one, and submits applications for you — with you in control at every step. Unlike bulk auto-apply bots, you approve your profile, you can take over live, and you only spend a credit when an application is actually submitted.

### 5.3 Tagline candidates (A/B test; pick one by launch)

1. **Apply smart. Not spray.** _(recommended lead)_
2. **Your job hunt, on autopilot. You keep the wheel.**
3. **One resume in. Tailored applications out.**
4. **Stop filling forms. Start getting interviews.** _(only if aggregate interview data supports it; see §6)_

### 5.4 Three message pillars

| Pillar         | One-liner                                                        | Proof (must be demoable)                                                                                         |
| -------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Fast**       | Upload once. We handle the forms.                                | Screen recording: resume → confirmed profile → first submitted application in minutes (use a real measured time) |
| **Tailored**   | Every application gets its own resume.                           | Before/after resume PDF for the same job                                                                         |
| **In control** | You approve it, you can take over, you pay only for what's sent. | Live takeover clip; credit ledger screenshot                                                                     |

### 5.5 Differentiators (ranked)

1. **Pay per submitted application** — failed or paused applications don't burn credits.
2. **Human takeover** — when a CAPTCHA or odd form appears, the user steps in live instead of the app guessing or bypassing.
3. **Confirmed profile** — the user verifies what the AI understood about them, so matches and tailoring start from truth.
4. **India-first** — ₹ pricing, UPI, fresher/startup-heavy roles, student pricing.
5. **Transparent tracker** — one place for every application and its status.

### 5.6 What we are NOT

Not a spam bot, not a LinkedIn automation tool, not a CAPTCHA breaker, not a recruiter, not a "guaranteed job" service.

---

## 6. Claims register

### 6.1 ✅ Allowed now _(verify each against the live product before publishing)_

- "Upload your resume once — we build your profile, and you confirm it."
- "We find and rank jobs that match your profile."
- "Every application gets a resume tailored to that job."
- "We fill and submit applications on supported job platforms (`[SUPPORTED_BOARDS]`)."
- "Hit a CAPTCHA or odd form? You can take over live and finish it."
- "You use an application only when it's actually submitted — failed or stuck doesn't count."
- "Track every application in one dashboard."
- "Connect with recruiters on LinkedIn while your applications go out." _(LinkedIn Connects — connection requests only; see §6.3 flag)_
- "Made in India. Priced in ₹. Pay with UPI or card." _(only after G1; payments run through Dodo)_

### 6.2 ⚠️ Conditional — needs our own data first

| Claim type                   | Needed evidence                                                                                    |
| ---------------------------- | -------------------------------------------------------------------------------------------------- |
| "Saves X hours/week"         | Beta timing study: median manual time per application vs ApplyOS (n ≥ 30 users)                    |
| "X% of users got interviews" | Defined, tracked metric (self-reported + verified), n ≥ 100 users, ≥ 30 days, show the denominator |
| "N applications submitted"   | Real counter from DB, only counting submitted                                                      |
| "Works on N platforms"       | Count of boards with success rate ≥ target in last 14 days                                         |
| Testimonials / logos         | Written permission from each person/company                                                        |

### 6.3 🚫 Banned (never publish)

- "Interview guaranteed", "job guaranteed", any refund-on-no-interview promise _(until legal + data approve a specific policy)_
- Competitor claims copied as ours (e.g. "70% got interviews", "3× more interviews")
- "Beat the ATS", "undetectable", "bypass bot detection", "human-like to avoid blocks"
- "Works on LinkedIn" / LinkedIn auto-apply (LinkedIn prohibits automated applications; we don't promise it)
  - ⚠️ **OPEN DECISION (Akash, 27 Oct 2026):** the codebase contains a LinkedIn Easy Apply adapter (`apps/apply-agent/app/ats/easy_apply.py`) plus LinkedIn connect automation. Until decided, keep LinkedIn auto-apply unmarketed, and choose either (a) gate the Easy Apply adapter off, or (b) consciously amend this register and §14.4 with legal input. Connection requests (Connects) are already allowed above.
- "Unlimited applications"
- Cover letters, outreach emails, follow-up drafts, reply sync, job-posting verification — **until shipped and working**
- "100% safe/secure", "your data never leaves our servers"
- Fake urgency (fake countdowns, fake "only 3 spots left")
- Real company logos implying partnership

---

## 7. Feature ladder (user-facing naming)

| Internal                                                                                 | User-facing name             | Status                                                        | Plan                      |
| ---------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------- | ------------------------- |
| Resume parse → ResumeIR                                                                  | **Profile Builder**          | Live                                                          | All                       |
| Confirm-profile step                                                                     | **Check Your Profile**       | Live                                                          | All                       |
| Job discovery + match (10 ATS parsers + 7 feed aggregators)                              | **Job Radar** (match %)      | Live                                                          | All                       |
| Tailoring → LaTeX PDF                                                                    | **Resume Remix**             | Live                                                          | All (1 per submitted app) |
| Apply automation (workflows + inline apply; standalone auto-apply page retired Oct 2026) | **Apply Runs**               | Live (supported boards)                                       | Applications quota        |
| HITL / live browser (CDP screencast + input relay)                                       | **Take the Wheel**           | Live                                                          | All                       |
| Tracker                                                                                  | **Application Board**        | Live                                                          | All                       |
| LinkedIn connection requests                                                             | **LinkedIn Connects**        | Live                                                          | All                       |
| Dodo subscription + 30-day application quota + top-ups                                   | **Applications**             | Built (verify live)                                           | —                         |
| Cover letters                                                                            | **Cover Letter Studio**      | **Not built**                                                 | Later                     |
| Follow-up drafts                                                                         | **Follow-Up Nudges**         | **Not built**                                                 | Later                     |
| Reply sync + status                                                                      | **Inbox Sync**               | **Not built**                                                 | Later                     |
| Outreach message sending                                                                 | **Reach Out**                | **Not built (501)**                                           | Later                     |
| Resume checks (stronger)                                                                 | **Resume Health Check**      | Partial (variant scoring exists, no product surface)          | Free hook once good       |
| Job-posting verification                                                                 | **Real Job Check**           | Partial (job-liveness checker exists, no product surface)     | Trust feature; high-value |
| Notifications                                                                            | **Pings** (email → WhatsApp) | **Scaffolding only** (Notification model unused, no triggers) | Later                     |

**Roadmap order for GTM impact:** (1) Resume Health Check (free hook & SEO), (2) Real Job Check (trust), (3) Cover Letter Studio (competitive parity), (4) Pings via email/WhatsApp (retention), (5) Follow-Up Nudges + Inbox Sync, (6) Reach Out.

---

## 8. Pricing & plans

### 8.1 Principles

1. **Application = one successfully submitted application** (the tailored resume for that job is included). Failed, paused, cancelled, or stuck items cost **0**.
2. **India first:** ₹ prices, UPI + cards, GST-inclusive display (confirm GST treatment with a CA). Separate USD price list for global users (regional price list, not a currency conversion).
3. **Freshers pay in bursts around job-hunt season**, so we offer both a subscription and a **non-recurring 90-day pass** (no auto-renew anxiety).
4. **Never charge for what isn't shipped.** Paid tiers must not list cover letters/follow-ups until they exist; mark them "coming soon" with no price impact.
5. **Protect margin:** every application must sell for ≥ 3× its variable cost (LLM + compute + browser automation + gateway fee). Measure `[COST_PER_SUBMITTED_APP]` in beta before locking prices.

### 8.2 Plan table — **as shipped (ground truth, 27 Oct 2026)**

Billing runs on **Dodo Payments** (merchant of record — Dodo handles tax invoices/compliance). Every plan is the full product; only volume differs. Quota counts applications that reach `submitted`, per 30-day cycle (`UsageCycle` model).

|                           | **Rookie (free)** | **Scout**    | **Ace**      | **Conqueror**  |
| ------------------------- | ----------------- | ------------ | ------------ | -------------- |
| Internal plan             | free              | starter      | pro          | power          |
| Price (INR)               | ₹0                | ₹499 / month | ₹999 / month | ₹2,199 / month |
| Annual (save ~33%)        | —                 | ₹3,999 / yr  | ₹7,999 / yr  | ₹17,999 / yr   |
| Quarterly                 | —                 | ₹1,199       | ₹2,099       | ₹5,299         |
| Applications / 30 days    | 25                | 150          | 400          | 1,000          |
| Effective ₹ / application | free              | ≈ ₹3.3       | ≈ ₹2.5       | ≈ ₹2.2         |

**Top-ups (any plan, Dodo hosted checkout):** +50 applications, +150 applications. Prices live in the Dodo product config (`DODO_PRODUCT_ADDON_PLUS_50` / `DODO_PRODUCT_ADDON_PLUS_150`) — **open item: confirm ₹ amounts and surface them in the UI**. Bonus applications apply to the _current_ cycle and expire with it (no rollover yet — see §8.3).

**Deferred proposals (revisit as pricing experiments, §8.9):** the earlier Starter/Hustle/Offer-Mode/Placement-Pass structure, a ₹299–499 test band, a USD price list, and a one-time 90-day pass. These do not exist in the product — the shipped table above is the only offer today.

### 8.3 Application-quota rules (as implemented; put on the pricing page in plain words)

- Quota is deducted only when an application reaches _submitted_ (first transition only). Failed, paused, cancelled, CAPTCHA-blocked, login-required and timed-out applications deduct 0. In-flight applications reserve against the quota so users can't oversubscribe.
- Every plan resets each 30-day cycle. Top-up applications apply to the current cycle and expire with it (no rollover today — "top-ups never expire" is a proposal, **don't claim it**).
- If an application is submitted twice by mistake, refund the duplicate (agent flags it, human approves). _(Not implemented — open item.)_
- Refund policy (draft for legal review): Dodo handles refunds as merchant of record; UPI may support full refunds only. Confirm the flow before publishing anything about refunds.

### 8.4 Student & campus

- **Student price:** 20% off Hustle/Offer Mode with a verified college email or student ID. (Placement Pass already has the best per-credit price.)
- **Campus Ambassador:** free Offer Mode while active + 50 credits per 10 referred verified users (see §11.5).
- **Campus plan (B2B, later):** ₹/seat/year for colleges' placement cells, with an admin dashboard. Not in v1.

### 8.5 Referral

Both sides get **+10 credits** when the invited user confirms their profile _and_ submits one application. Cap: 100 referral credits per user. Prevents fake-signup farming.

### 8.6 Abuse prevention (protects free-tier cost)

- Phone OTP verification before free credits unlock; one account per phone/device fingerprint.
- Free credits cannot be transferred or cashed out.
- Daily caps per plan; velocity checks; match-score threshold so users can't blindly spam low-fit roles.
- **Worst-case free cost** = 25 applications × `[COST_PER_SUBMITTED_APP]` × signups. Example: if cost is ₹2.5, then 10,000 signups all using every free application ≈ ₹6.25 lakh. Set a monthly free-quota budget and an auto-pause trigger.

### 8.7 Unit economics worksheet (agent: fill during beta)

```
Variable cost per submitted app =
    LLM (parse + match + tailor + automation reasoning)
  + browser/compute minutes
  + PDF/LaTeX compile + storage
  + payment gateway fee (avg per credit, verify current rates)
  + support allowance
Target: price_per_application ≥ 3 × variable cost  → gross margin ≥ ~65%
Reprice or cut the free quota if Scout (≈₹3.3/application) fails this test.
```

### 8.8 Revenue scenarios (illustrative only — assumptions, not forecasts)

| Scenario     | Signups (first 90 days) | Free→paid | Payers | Blended revenue/payer/mo | MRR (₹)     |
| ------------ | ----------------------- | --------- | ------ | ------------------------ | ----------- |
| Conservative | 3,000                   | 3%        | 90     | ₹450                     | ~₹40,500    |
| Base         | 10,000                  | 5%        | 500    | ₹550                     | ~₹2.75 lakh |
| Stretch      | 25,000                  | 7%        | 1,750  | ₹650                     | ~₹11.4 lakh |

(Placement Pass revenue is lumpy; treat its ₹2,499 as ~₹830/mo for blended ARPU.)

### 8.9 Pricing experiments (run in beta/launch)

| ID  | Test                           | Variants                               | Success metric                                |
| --- | ------------------------------ | -------------------------------------- | --------------------------------------------- |
| P1  | Hustle price                   | ₹299 / ₹399 / ₹499                     | Revenue per 100 new users                     |
| P2  | Free credits                   | 10 vs 15 vs 25                         | Activation → paid conversion net of free cost |
| P3  | Pass vs subscription emphasis  | Pass highlighted vs Hustle highlighted | Paid conversion, ARPU                         |
| P4  | Student discount               | 20% vs ₹99 first month                 | Student paid conversion                       |
| P5  | Credit pack vs plan default    | Show top-ups first vs plans first      | Paid conversion, 30-day retention             |
| P6  | "Pay only for submitted" badge | With/without on pricing page           | Pricing-page → checkout rate                  |

_Outcome-based pricing (fee per interview) is **parked**: it creates incentive and tracking problems and we can't verify interviews yet. Revisit after Inbox Sync ships._

---

## 9. Brand voice & copy bank (Gen Z)

### 9.1 Voice

- **Smart friend who's already been through the grind.** Short sentences. Plain words. Light humor, no cringe slang overload.
- **Honest > hype.** We admit limits ("we're in beta").
- **Respect their time and money.** Always show what it costs.
- Use Hinglish **sparingly** in social only (e.g., one line per post), never in product UI or legal text.
- Don't mock job seekers; mock the _forms_.

### 9.2 Hero copy options

- **H1:** "Apply smart. Not spray."
  **Sub:** "Upload your resume once. ApplyOS finds roles that fit, tailors your resume for each one, and submits the application — you stay in control."
  **CTA:** "Start free — 15 applications on us"
- **H1:** "Stop copy-pasting your life into 47 forms."
  **Sub:** "Resume in. Tailored applications out. Pay only when it's actually submitted."
- **H1:** "Your resume, but for every job."
  **Sub:** "One resume becomes a custom one per role. We handle the forms; you take the wheel whenever you want."

### 9.3 Microcopy

| Where           | Copy                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------ |
| Profile confirm | "Here's what we understood about you. Fix anything that's off — better profile, better matches." |
| Match score     | "78% match — your React + Node projects line up well."                                           |
| Credit tooltip  | "1 credit = 1 application actually submitted. Failed or paused? No charge."                      |
| Takeover        | "Stuck on a CAPTCHA? Hop in and finish it. We'll pick up after."                                 |
| Empty tracker   | "Nothing here yet. Your first application takes about a few minutes." _(use real measured time)_ |
| Low credits     | "2 credits left. Top up ₹249 for 25 more — they never expire."                                   |
| Beta badge      | "Beta — we're improving every week. Tell us what's broken."                                      |
| Cap reached     | "Daily limit hit (we keep it human-paced so your profile stays clean). Back tomorrow."           |

### 9.4 Social post starters (adapt to channel)

- "Applied to 40 jobs last week. Filled the same form 40 times. Here's what I'd do instead 🧵" _(Founder X)_
- "POV: your 'Apply' tab is still open from Tuesday." _(Reels/Shorts, screen-record)_
- "We don't charge you when an application fails. Why does every other tool?" _(X, LinkedIn)_
- "Build-in-public: how our resume tailoring works (ResumeIR → LaTeX PDF)." _(dev audience; transparent technical posts earn trust)_

---

## 10. Website & pricing page spec

### 10.1 Landing page structure (mobile-first; most traffic will be phones)

1. **Hero** — H1, sub, primary CTA, 15-second looping product demo (resume → matches → submitted).
2. **Problem strip** — "Same forms. 50 tabs. Zero replies." (3 pain points, one line each)
3. **How it works (4 steps)** — Upload → Check your profile → Pick jobs → We apply (you can take over anytime).
4. **Resume Remix before/after** — real example, anonymized.
5. **Take the Wheel** — short video of live takeover (the trust-builder).
6. **Credits explained** — "Pay only for submitted applications."
7. **Pricing** (see 10.2)
8. **Honest limits ("What we don't do")** — no LinkedIn auto-apply, no guaranteed interviews, beta label. This is a _feature_ for Gen Z trust.
9. **Security & privacy** — plain-language bullets, link to privacy policy, delete-my-data.
10. **FAQ** (Appendix A)
11. **Footer** — Terms, Privacy, Refund policy, contact, Discord, X, Instagram.

### 10.2 Pricing page rules

- Default view: **₹ monthly**; toggle for USD.
- Highlight **Hustle** as "Most picked" _only if data supports it_; otherwise highlight Placement Pass with a "Best for job-hunt season" label (no fake popularity badges).
- Show the effective per-application price. _(Shipped 2026-10-27.)_
- Show "What counts as a submitted application" box directly below the cards. _(Shipped 2026-10-27.)_
- Show "coming soon" items greyed, labeled, not counted in the value.
- Include student-discount CTA: "Student? Verify and get 20% off."

### 10.3 SEO targets (programmatic + editorial)

`resume tailoring AI India`, `auto apply jobs for freshers`, `how to get a job as a fresher in India`, `ATS friendly resume for freshers`, `resume for software developer fresher`, `fresher jobs in [city]`, `internship to job-conversion tips`. Build one free tool page per keyword group (e.g., Resume Health Check, "ATS resume checker for freshers") as top-of-funnel lead magnets.

---

## 11. Go-to-market plan

### 11.1 Timeline (proposal; aligns with the Jan–Jun fresher hiring half)

| Phase                                             | Dates (target)                                          | Goal                                                                      | Exit criteria                                                                                     |
| ------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **Phase 0 — Fix foundations**                     | 27 Oct – 20 Nov 2026                                    | Pass gates G1–G7 (G2, G4, G5, G6 first)                                   | Gate checklist green                                                                              |
| **Phase 1 — Waitlist + closed beta**              | 23 Nov – 20 Dec                                         | 100–200 beta users, learn activation & cost                               | ≥ 60% of beta users reach "first submitted application"; cost per app measured; top 10 bugs fixed |
| **Phase 2 — Open beta (public free-tier + paid)** | 4 Jan – 18 Jan 2027                                     | First 500 signups, first 25 paying users                                  | Paid conversion ≥ 3%; automation success rate ≥ target per board                                  |
| **Phase 3 — Public launch**                       | ~ 19–26 Jan 2027 (Product Hunt + campus + creator wave) | 3,000+ signups in 30 days                                                 | Retention + margin stay healthy                                                                   |
| **Phase 4 — Campus & scale**                      | Feb – Jun 2027                                          | Campus ambassadors, college partnerships, graduating-batch push (Apr–Jun) | MRR trajectory per §8.8 base case                                                                 |

> Why January: H1 fresher hiring, new-year "career reset" mindset, and time to complete DPDP groundwork before full enforcement (see §14).

### 11.2 Channel priority

| Priority | Channel                                                                   | Why                                               | First action                                                         |
| -------- | ------------------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------- |
| 1        | **Instagram Reels + YouTube Shorts**                                      | Gen Z attention; screen-record demos are cheap    | 3 Reels/week from Phase 1                                            |
| 2        | **X (founder-led)** + **LinkedIn India**                                  | Credibility with devs/recruiters; build-in-public | Daily build log; weekly thread                                       |
| 3        | **Reddit** (r/developersIndia, r/cscareerquestionsIndia-type communities) | High-intent fresher discussion                    | Value-first posts, no spam; follow each subreddit's self-promo rules |
| 4        | **College Discord/WhatsApp/Telegram communities**                         | Direct fresher reach                              | Join legitimately; offer free Resume Health Checks                   |
| 5        | **Campus ambassadors** (start with Durgapur/East India, then metros)      | Trust through peers                               | Recruit 10 ambassadors in Phase 1–2                                  |
| 6        | **Micro-creators** (career/coding YouTubers, 5k–100k subs)                | Authentic demos                                   | Barter: free Placement Pass + affiliate code                         |
| 7        | **SEO + free tools**                                                      | Compounding inbound                               | Ship Resume Health Check landing page                                |
| 8        | **Product Hunt / Hacker News**                                            | Dev credibility, global backlinks                 | Launch in Phase 3                                                    |
| 9        | Paid ads (Meta/Google)                                                    | Only after funnel + unit economics proven         | ≤ ₹15k test budget, Phase 2                                          |

### 11.3 Content engine (weekly cadence)

- **3× short videos:** (a) demo clip, (b) resume teardown ("fixing a fresher resume in 60 seconds"), (c) job-hunt tip.
- **1× X thread / LinkedIn post:** data or build-in-public lesson.
- **1× long-form SEO article:** fresher job-search guide, linking to a free tool.
- **1× community value drop:** free template, checklist, or AMA.
- **Monthly:** "Transparency report" — total applications submitted, automation success rate, what broke, what we fixed. _(only real numbers)_

### 11.4 Launch assets checklist

- Landing page, pricing page, waitlist form with referral link
- 60-sec hero demo, 15-sec loop, 3 feature clips (Remix, Wheel, Board)
- Product Hunt listing, first comment, 5 gallery images
- Press/creator kit: logo, screenshots, one-pager, founder bio, FAQ
- Email/WhatsApp lifecycle flows (§12.3)
- Status page + changelog + public roadmap ("What's coming": cover letters, Real Job Check, etc.)

### 11.5 Campus ambassador program

- **Who:** final-year students, placement-cell volunteers, coding-club leads.
- **Give:** free Offer Mode while active, 50 credits per 10 verified referrals, early access, certificate/LinkedIn recommendation after 8 weeks.
- **Get (ask):** host 1 resume workshop/month, share referral link in college groups, collect feedback.
- **Safety:** ambassadors may never promise jobs or interviews; share the approved claims sheet (§6).
- **Tracking:** unique codes per ambassador; verified-user count in dashboard.

### 11.6 Partnerships (Phase 4)

Coding bootcamps, college placement cells, student tech communities, GDSC-style clubs, resume/portfolio tool integrations. Offer a "Placement Pass" group discount and a branded workshop. Don't claim endorsement without a signed agreement.

---

## 12. Activation, retention & lifecycle

### 12.1 North-star and activation

- **North-star metric:** _Qualified applications submitted per active user per week_ (qualified = above match threshold).
- **Aha moment:** first application submitted that the user reviewed (not just auto-sent).
- **Activation event:** resume uploaded → profile confirmed → ≥ 1 application submitted within 24h.

### 12.2 Funnel metrics (instrument all)

`visit → signup → resume upload → profile confirmed → first match viewed → first application submitted → 5 applications → paid → renewal/top-up → referral`
Also track: automation success rate per board, takeover rate, time-to-first-submit, credit burn per user, refund rate, interview-reported rate (self-reported, optional).

### 12.3 Lifecycle messaging (email first; WhatsApp after consent + templates approved)

| Trigger                              | Channel        | Message intent                                          |
| ------------------------------------ | -------------- | ------------------------------------------------------- |
| Signup, no resume in 1h              | Email          | "Upload your resume — takes 1 minute"                   |
| Resume uploaded, profile unconfirmed | Email          | "Check your profile — 2 min fix = better matches"       |
| Profile confirmed, no apply in 24h   | Email          | "3 roles match you ≥ 80%. Apply with one click"         |
| First submission done                | Email          | Celebrate; "Apply to 4 more this week?"; referral nudge |
| Needs-review item                    | In-app + email | "One application needs you — Take the Wheel"            |
| Quota nearly used                    | In-app + email | Top-up / plan                                           |
| 7 days inactive                      | Email          | Show new matches only (no guilt copy)                   |
| Day 80 on Placement Pass             | Email          | Renewal or switch to Hustle                             |

Rules: max 3 marketing messages/week, one-click unsubscribe, honor consent withdrawal immediately (DPDP).

### 12.4 Feedback loops

- In-app "What went wrong?" after any failed/paused application.
- Weekly beta call (15 min) with 5 users.
- Public changelog + "You asked, we shipped" post each fortnight.

---

## 13. Experiments (non-pricing)

| ID  | Hypothesis                                            | Test                              | Metric                                |
| --- | ----------------------------------------------------- | --------------------------------- | ------------------------------------- |
| E1  | "Apply smart. Not spray." beats "Stop filling forms." | Landing page A/B                  | Signup rate                           |
| E2  | Free Resume Health Check is the best top-of-funnel    | Tool page vs main page            | Signup per visit, activation          |
| E3  | Auto-submit with pre-approval beats full auto         | Approval-first vs one-click-batch | Satisfaction, interview-reported rate |
| E4  | WhatsApp pings beat email for re-engagement           | Channel split (post-consent)      | 7-day return rate                     |
| E5  | Creator demos beat static ads on CAC                  | 3 creators vs ₹10k ads            | Cost per activated user               |
| E6  | Campus ambassador referrals have higher retention     | Compare cohorts                   | 30-day retention                      |

---

## 14. Legal, privacy, trust (needs human/legal sign-off)

1. **India DPDP Act/Rules:** the DPDP Rules were notified in November 2025 with phased compliance; most operational obligations (notice, security, breach reporting, rights) become enforceable around mid-May 2027. Build now: itemized **consent notice** at resume upload (what data, why, for what purpose), **easy withdrawal** (as easy as giving consent), **delete-my-data** flow, **breach response runbook**, retention limits, and a grievance contact. Have a lawyer review.
2. **Age gate:** 18+ only at launch (minors need verifiable parental consent under DPDP; avoid the problem).
3. **Resume data = sensitive in practice:** encrypt in transit and at rest, access-control, no training on user resumes without explicit opt-in, no sharing/selling data.
4. **Platform terms:** respect each job board's terms. Don't automate sites that prohibit it (e.g. LinkedIn). Never bypass or solve CAPTCHAs — route to human takeover. Per-board kill switch.
5. **Consumer terms:** Terms of Service, Privacy Policy, Refund Policy, clear "beta" disclosure, "we don't guarantee interviews or jobs".
6. **Advertising rules:** every claim backed by data (§6); testimonials with written consent; disclose creator/affiliate relationships (e.g., "#ad" / paid partnership tag).
7. **Payments/tax:** confirm GST registration and invoicing for ₹ sales, gateway KYC, and refund flow.
8. **Transparency:** public page explaining how automation works, what is stored, and how to delete everything.

---

## 15. Risk register

| Risk                                                   | Likelihood | Impact    | Mitigation                                                                                      | Owner       |
| ------------------------------------------------------ | ---------- | --------- | ----------------------------------------------------------------------------------------------- | ----------- |
| Job boards block/ban automation                        | High       | High      | Official APIs where available, human takeover, rate limits, per-board kill switch, never bypass | ENG         |
| Spammy outcomes harm users' reputation                 | Med        | High      | Match-score threshold, daily caps, user approval, "quality over quantity" messaging             | ENG/Product |
| Free-tier cost blowout                                 | Med        | High      | OTP gating, caps, budget auto-pause, measure cost/app                                           | ENG/HUMAN   |
| Overpromising → trust loss                             | Med        | High      | §6 claims register, agent checks every asset                                                    | AGENT       |
| Billing/credit bugs (double charge)                    | Med        | High      | G1/G6 tests, ledger audit, quick refunds                                                        | ENG         |
| Data breach                                            | Low-Med    | Very high | Encryption, access control, monitoring, runbook                                                 | ENG         |
| Competitors copy / free tiers undercut us              | High       | Med       | India focus, community, takeover trust, speed of shipping                                       | Team        |
| Roadmap features slip (cover letters etc.)             | High       | Med       | Don't sell unshipped features; keep roadmap public                                              | Product     |
| Seasonality (fresher hiring dips)                      | Med        | Med       | Placement Pass, 0–2 yr switcher segment, global remote                                          | Team        |
| Founder bandwidth (building multiple products at once) | High       | High      | Ruthless scope: ship gates → beta → launch; defer outreach/Reach Out                            | Akash       |

---

## 16. Agent task backlog

**Legend:** `AGENT` = agent does it; `HUMAN` = needs a person's decision/approval; `ENG` = engineering change in the repo. Order = priority.

### Track A — Foundations (Phase 0)

| ID  | Task                                                                                                                                                                            | Owner       | Acceptance test                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------- |
| A1  | Audit repo & produce `[SUPPORTED_BOARDS]` list with last-14-day success rate per board                                                                                          | AGENT       | Table committed in `/docs/supported-boards.md`, sourced from logs/tests |
| A2  | Verify live billing end-to-end (UPI + card, webhook, refund, GST invoice) — runbook: `docs/g1-dodo-billing-runbook.md`; refund clawback + webhook evidence endpoint implemented | ENG         | G1 passes with a real ₹ test purchase                                   |
| A3  | Migrate resume/artifact storage to durable object storage                                                                                                                       | ENG         | G2 passes                                                               |
| A4  | Add monitoring/alerts dashboard                                                                                                                                                 | ENG         | G3 passes                                                               |
| A5  | Implement daily caps, match threshold, per-board kill switch                                                                                                                    | ENG         | G4 passes                                                               |
| A6  | Verify "credit only on submitted" logic with automated tests                                                                                                                    | ENG         | G6 passes                                                               |
| A7  | Consent notice, privacy policy, delete-my-data, 18+ gate                                                                                                                        | ENG + HUMAN | G5 passes; lawyer reviewed                                              |
| A8  | Phone-OTP gate for free credits                                                                                                                                                 | ENG         | One free grant per phone                                                |
| A9  | Instrument funnel events (§12.2)                                                                                                                                                | ENG         | Dashboard shows each step with counts                                   |
| A10 | Measure `[COST_PER_SUBMITTED_APP]` on 50 real applications                                                                                                                      | AGENT/ENG   | Cost breakdown committed to `/docs/unit-economics.md`                   |

### Track B — Pricing & billing config

| ID  | Task                                                                     | Owner       | Acceptance test                                                |
| --- | ------------------------------------------------------------------------ | ----------- | -------------------------------------------------------------- |
| B1  | Configure plans, credit grants, caps, top-ups per §8.2 in billing system | ENG         | Each plan purchasable in test mode; credits & caps match table |
| B2  | Build pricing page per §10.2 with ₹/USD toggle                           | AGENT + ENG | Mobile Lighthouse ≥ 90; "What counts as a credit" visible      |
| B3  | Student verification flow + 20% discount                                 | ENG         | College email verified → discount applied                      |
| B4  | Referral system with caps (§8.5)                                         | ENG         | Credits issue only after referee's first submitted app         |
| B5  | Finalize prices after beta using §8.9 results                            | HUMAN       | Decision logged in `LAUNCH_LOG.md`                             |

### Track C — Brand & website

| ID  | Task                                                         | Owner                                           | Acceptance test                            |
| --- | ------------------------------------------------------------ | ----------------------------------------------- | ------------------------------------------ |
| C1  | Pick tagline via A/B (E1); lock brand voice doc              | HUMAN                                           | Decision logged                            |
| C2  | Build landing page per §10.1                                 | AGENT + ENG                                     | All 11 sections live; copy passes §6 check |
| C3  | Produce hero demo (60s) + loop (15s) + 3 feature clips       | HUMAN (screen-record) + AGENT (script/captions) | Assets in `/marketing/video/`              |
| C4  | Write FAQ page (Appendix A), Terms, Privacy, Refund (drafts) | AGENT drafts → HUMAN/legal approves             | Legal sign-off                             |
| C5  | Public changelog + roadmap page                              | AGENT                                           | Live; contains only §7 statuses            |
| C6  | Build Resume Health Check landing page (free tool/hook)      | ENG + AGENT                                     | Works without login; CTA to sign up        |

### Track D — Beta & community

| ID  | Task                                                                                   | Owner                  | Acceptance test                      |
| --- | -------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------ |
| D1  | Waitlist page with referral position                                                   | ENG                    | 100 signups target tracked           |
| D2  | Recruit 100–200 closed-beta users from college groups/X/Reddit (value-first)           | HUMAN + AGENT (drafts) | Invite list in CRM                   |
| D3  | Set up Discord with channels (#start-here, #bugs, #wins, #resume-help, #announcements) | HUMAN                  | Live; rules pinned                   |
| D4  | Weekly beta feedback summary                                                           | AGENT                  | Report each Monday with top 5 issues |
| D5  | Beta survey: time saved, price sensitivity (Van Westendorp-style 4 questions), NPS     | AGENT                  | ≥ 50 responses                       |
| D6  | Collect 5–10 testimonials with written consent                                         | HUMAN                  | Consents stored                      |

### Track E — Content & channels

| ID  | Task                                                                 | Owner                        | Acceptance test                    |
| --- | -------------------------------------------------------------------- | ---------------------------- | ---------------------------------- |
| E1  | 30-day content calendar (Reels/Shorts, X, LinkedIn, Reddit, SEO)     | AGENT                        | Calendar approved                  |
| E2  | Draft 12 short-video scripts + captions                              | AGENT                        | Scripts pass §6                    |
| E3  | Founder X build-in-public thread series (4)                          | AGENT drafts → HUMAN posts   | Posted                             |
| E4  | 10 SEO articles + 3 free-tool pages                                  | AGENT drafts → HUMAN reviews | Published                          |
| E5  | Creator shortlist (30 names) + outreach templates                    | AGENT                        | HUMAN approves before any DM/email |
| E6  | Campus ambassador kit (deck, claims sheet, referral codes)           | AGENT                        | 10 ambassadors onboarded           |
| E7  | Product Hunt kit (listing, gallery, first comment, maker reply bank) | AGENT                        | Reviewed 7 days before launch      |

### Track F — Launch & measurement

| ID  | Task                                                           | Owner                            | Acceptance test                         |
| --- | -------------------------------------------------------------- | -------------------------------- | --------------------------------------- |
| F1  | Launch-day runbook (hour-by-hour)                              | AGENT                            | Reviewed                                |
| F2  | Weekly growth report (funnel, CAC, margin, automation success) | AGENT-AUTONOMOUS (internal only) | Posted every Monday                     |
| F3  | Monthly transparency report (public)                           | AGENT drafts → HUMAN publishes   | Real numbers only                       |
| F4  | Claims audit of every public asset before it goes live         | AGENT                            | Checklist in `LAUNCH_LOG.md` signed off |

---

## 17. KPIs & targets

| Phase                   | Target                                                                                                          |
| ----------------------- | --------------------------------------------------------------------------------------------------------------- |
| Closed beta             | 100–200 users · ≥ 60% reach first submit · automation success ≥ agreed per board · cost per submitted app known |
| Open beta               | 500 signups · ≥ 3% paid · refund rate < 5%                                                                      |
| Public launch (30 days) | 3,000+ signups · 5% paid (stretch) · NPS ≥ 30 · gross margin ≥ 65%                                              |
| 6 months                | Base-case MRR (~₹2.75 lakh) · 10+ active campus ambassadors · 1–2 college partnerships                          |

_Targets are planning assumptions; adjust with beta data._

---

## Appendix A — FAQ copy (draft)

**Is this a bot that spams companies?** No. You confirm your profile, we only apply to roles above a match threshold, and you can pause or take over anytime.

**What counts as a submitted application?** Only one that actually goes out. Failed, stuck, or cancelled applications don't use your quota.

**Which sites do you work on?** Startup and company career sites — Greenhouse, Lever, Ashby, Workable, Workday, Wellfound and more — plus a generic mode for other forms. We don't bypass CAPTCHAs.

**What if a site asks for a CAPTCHA?** You take over live and finish it; we continue after. We don't bypass CAPTCHAs.

**Will I get interviews?** We can't promise interviews or jobs — nobody honestly can. We help you apply faster, with a tailored resume for each role.

**Do you write cover letters or send outreach emails?** Not yet. They're on our roadmap; we'll tell you when they ship.

**Is my resume safe?** Your resumes and application history stay in your account and we never sell personal data. Privacy policy and delete-my-data are shipping with the G5 gate. _(strengthen wording only after G5)_

**Can I pay with UPI?** Yes, via our payment partner Dodo. _(only after G1)_

**Is there a student discount?** Not yet — planned. _(enable only after B3 ships)_

**Do applications roll over?** Each plan resets every 30 days. Top-up applications apply to your current cycle.

**Is ApplyOS free?** Every new account gets 25 submitted applications per 30-day cycle, free.

---

## Appendix B — Source notes (re-verify before external use)

- LinkedIn India job-search research (via People Matters): applicants per job doubled; 84% feel unprepared; 72% plan to look; 94% plan to use AI — https://www.peoplematters.in/news/recruiting-and-onboarding/applicants-per-job-double-in-india-intensifying-job-search-pressure-linkedin-47949
- TeamLease EdTech Career Outlook HY2 2026 (fresher hiring intent 75%, IT 81%→76%, startups/retail 93%, Bengaluru 89%) — https://www.peoplematters.in/amp/news/workforce-planning/fresher-hiring-intent-rises-to-75percent-but-it-demand-loses-ground-report-51352
- TeamLease HY1 2026 (internships/projects advantage) — https://www.outlookmoney.com/news/73-per-cent-employers-plan-to-hire-freshers-in-h1-2026-says-report
- Gen Z first-job priorities and pay-transparency drop-offs — https://cxotoday.com/media-coverage/google-microsoft-amazon-emerge-as-indias-most-desired-employers-for-gen-z-insights-from-37000-students/
- Competitor pricing roundups (reported, not official): https://www.loopcv.pro/directory/ (note: LoopCV is a competitor), https://wordable.io/?p=27917, https://blaze.today/blog/ai-job-application-tools/, https://www.toolworthy.ai/blog/best-ai-job-application-tools
- DPDP Rules 2025 (notified 14 Nov 2025; 18-month phased compliance) — https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf and https://dev.to/mr_manushukla/dpdp-act-2026-the-engineering-playbook-for-indian-startups-deadlines-consent-breach-5ee8
- Internal research report: `deep-research-report (1).md` (competitor matrix, ATS/portal audit, pricing model options, 90-day roadmap)

_End of playbook. Update this file whenever product reality, pricing, or claims change._
