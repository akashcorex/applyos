# Local apply verification — overnight run

Date: 2026-10-25 · Branch: `feat/fortress-engine` · Engine switch: `APPLY_BROWSER_ENGINE=playwright|fortress`

## What was required

A real local application must fill every field and submit successfully, with no bot/CAPTCHA
block, for every ATS the platform supports.

## Result

4 real applications submitted across 3 ATS platforms. No submission was faked or mocked;
each `submitted` status came from the handler detecting the site's own confirmation page.

| ATS | Board / job | Engine | Time | Result |
|---|---|---|---|---|
| Greenhouse | Vercel — Software Engineer, Data Platform | Playwright | 47s | **submitted** |
| Greenhouse | GitLab — job 8704363002 | Fortress | 531s | **submitted** |
| Ashby | Notion — Forward Deployed Engineer, India | Playwright | 74s | **submitted** |
| Workable | Devolens — Fullstack Software Engineer .NET | Fortress | 126s | **submitted** |

The GitLab row is the important one. Under Playwright the same board responded to the submit
click with an emailed 8-character security code and refused to accept the application. Under
Fortress the identical flow submitted with no verification challenge at all. That is direct
evidence the Fortress fingerprint defeats Greenhouse's risk check.

The Workable row is the second: under Playwright, Cloudflare Turnstile reported
`CF session check failed` on a trusted click and rejected a solver token. Under Fortress the
same board passed Turnstile natively and submitted.

## Per-ATS status

| ATS | Status | Root cause / notes |
|---|---|---|
| Greenhouse | ✅ works | Playwright works on boards without risk checks; Fortress clears boards that demand email verification. |
| Ashby | ✅ works | Playwright submitted cleanly. |
| Workable | ✅ works (Fortress) | Cloudflare Turnstile on submit. Passes with Fortress; Playwright cannot. |
| Lever | ❌ blocked | hCaptcha **Enterprise** on submit. Silent pass fails on both engines; CapSolver's plan rejects `HCaptchaEnterpriseTaskProxyLess` with "service is not supported", and the standard task is rejected too. |
| Generic / feed | ❌ blocked | The platform's feed sources (Himalayas, Jobicy, We Work Remotely) are aggregators behind Cloudflare managed challenges, and they are not application forms. |
| Workday | ❌ not implemented | `app/ats/workday.py` is a 180-line stub: no Apply-menu, no account creation, no multi-step form. |
| Wellfound / LinkedIn | ❌ not testable | No stored browser session exists for the user in Redis, and login is interactive. |

## Why Fortress was needed (and its limits)

Fortress is a real, separately compiled Chromium with a native fingerprint
(`navigator.webdriver === false`, coherent platform/GPU, 0/58 sannysoft failures vs 2 for the
Playwright stack). It is materially better at bot checks, as the two rows above show.

Limits found:

- **Clicks stall.** On heavy React widgets (Greenhouse React Select, Lever fields) the CDP
  click never acknowledges and Playwright times out after 30s. Fixed by a JS-click fallback
  (`app/browser/dom.py::safe_click`), which also cut Greenhouse field extraction from 184s to
  normal.
- **It is slow.** Roughly 10× slower per DOM operation than Playwright: 126–531s per
  application versus 47–74s.
- **macOS is stuck on v153.** v156 ships Linux only. The production target (Linux x64) is on a
  maintained build; this Mac is on the vendor's neglected one.

## Bugs fixed along the way

1. **Hidden twin inputs** — Lever ships a hidden `consent[marketing]` input beside the real
   checkbox; acting on the hidden one silently no-ops. Added `first_visible()` and used it in
   the Greenhouse, Generic and Lever fill loops.
2. **Lever never extracted radios** — required radio groups were invisible to the mapper.
   Added grouped radio extraction and filling.
3. **Lever grouped checkboxes** — same-name checkbox groups (e.g. "previously employed by X")
   were treated as a single boolean. Now matched by option text/value.
4. **Exact radio match rejected** — an exact match broke the loop before the score was set, so
   perfect matches were discarded. Fixed.
5. **Lever card option text** — Lever card radios carry UUID values; option text now comes from
   the label or row.
6. **Workable resume went to the Photo input** — the selector took the first file input in DOM
   order. Now targets `input[data-ui='resume']`.
7. **Workable double slash** — `/j/<id>/` + `/apply` produced `//apply`.
8. **Invisible CAPTCHA false positives** — Greenhouse reCAPTCHA and Lever hCaptcha are invisible
   and only run on submit; we blocked before giving them a chance. Detection now distinguishes
   visible challenges, and Lever is never gated before submit.
9. **Turnstile click** — the visible widget iframe was missed by the frame-based lookup; it is
   now clicked directly through the page mouse.
10. **Field mapper invented facts** — it answered "Yes - Intern" to a real employment-history
    question and proposed options that did not exist. The prompt now forbids inventing history
    and only allows real option texts; a deterministic check drops literals that are not options.

## Tests

65 tests pass, ruff clean (`uvx ruff@0.16.5 check apps/apply-agent`).

New: `tests/test_dom_helpers.py` (visible-twin + click fallback), `tests/test_field_mapper.py`
(option validation), `tests/test_lever_groups.py` (radio/checkbox group matching),
`tests/test_captcha_detection.py` (visible vs invisible CAPTCHA).

## How to reproduce

```bash
# Fortress (needed for Greenhouse boards that ask for an email code, and for Workable)
export APPLY_BROWSER_ENGINE=fortress
export FORTRESS_CHROME_BIN="$PWD/.fortress/v153.0.8010.36/fortress-v153/Chromium.app/Contents/MacOS/Chromium"
python scripts/setup_fortress.py --tag v153.0.8010.36   # once

# default engine (rollback switch)
export APPLY_BROWSER_ENGINE=playwright
```

Run a single apply through the real worker:

```bash
python /tmp/ats_probe.py --url "<job-url>" --job-id probe-1 --timeout 900
```

## Recommended next steps

1. **Make Fortress the default for the submit path** (keep Playwright as the rollback) — it is
   the difference between "verification email required" and "submitted" on Greenhouse, and
   between "Cloudflare blocked" and "submitted" on Workable.
2. **Lever**: CapSolver's hCaptcha Enterprise task is not enabled on the current plan. Either
   enable it, or treat Lever as a manual hand-off.
3. **Workday**: needs a real handler (Apply menu → Apply Manually → account creation →
   multi-step form). That is a build, not a fix.
4. **Generic**: feed sources should resolve to the employer's real ATS URL before applying;
   applying on aggregator pages is not meaningful.
5. **Speed**: Fortress's per-call cost dominates; batching field extraction would help most.
6. **Email verification**: the platform has no inbox access, so boards that insist on a code
   (some Greenhouse accounts) need either a human hand-off or an IMAP/Gmail integration.

## Note on side effects

The four applications above were sent to real employers with the account's real resume, as
authorised. No further applications were sent.
