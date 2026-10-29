# G1 Runbook — Dodo live billing verification

> Gate: G1 ("Live billing verified — Dodo live mode") in `ApplyOS-GTM-Playbook.md` §1.4.
> Engineering side is built (checkout, webhook grant, refund clawback, webhook receipt log).
> This runbook is the live verification you execute with real money. Log results in `LAUNCH_LOG.md`.

## 0. Preconditions

- [ ] Dodo business account activated for **live mode** (KYC done).
- [ ] Webhook endpoint registered in Dodo dashboard (Developer → Webhooks) pointing to
      `https://<api-host>/v1/billing/webhook` with events: `payment.succeeded`,
      `subscription.*`, `refund.*`. Copy the **live** signing secret.
- [ ] An ADMIN user exists (for the evidence endpoint below).
- [ ] A full dry run passed in `DODO_ENVIRONMENT=test` first.

## 1. Environment checklist (`apps/api/.env` / Railway)

| Var                                                           | Value                                                                                                                                                     |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DODO_ENVIRONMENT`                                            | `live`                                                                                                                                                    |
| `DODO_API_KEY`                                                | live API key                                                                                                                                              |
| `DODO_WEBHOOK_SECRET`                                         | **live** webhook signing secret                                                                                                                           |
| `DODO_PRODUCT_{STARTER,PRO,POWER}_{MONTHLY,QUARTERLY,ANNUAL}` | 9 live product ids, priced per `packages/validation/src/billing.ts` (Scout ₹499/₹1,199/₹3,999 · Ace ₹999/₹2,099/₹7,999 · Conqueror ₹2,199/₹5,299/₹17,799) |
| `DODO_PRODUCT_ADDON_PLUS_50` / `DODO_PRODUCT_ADDON_PLUS_150`  | 2 live add-on products — **record their ₹ prices here for the UI (open item)**                                                                            |

The API warns at startup if `DODO_ENVIRONMENT` is unset (defaults to `test_mode`). Check the logs.

## 2. Verification steps

**Run `bun run billing:preflight` first** — it checks every env var, retrieves
each product from Dodo, and verifies its price against the plan table
(mismatches fail the script). It also prints the top-up prices — record them
for the billing UI and pricing page (open item).

1. **Card payment (subscription).** Buy Scout monthly (₹499) with a card via checkout.
   - Expect: billing page (`/dashboard/settings/billing`) shows plan **Scout / active**, cycle 150 applications.
   - Evidence: `GET /v1/admin/billing-events?limit=50` shows `checkout.session.completed`,
     `subscription.active`, `payment.succeeded`; `GET /v1/billing/me` →
     `invoices[].paymentMethod` records the method used (e.g. `card_redirect`, `upi_collect`).
   - Note: `payment.succeeded` logs a non-fatal "could not map to a plan/add-on" warning for
     plan purchases — grants flow through `subscription.active` instead. Expected noise.

2. **UPI payment (top-up).** Buy the +50 add-on with UPI.
   - Expect: cycle bonus +50 on the billing page.
   - Evidence: `payment.succeeded` in billing-events; Dodo dashboard shows the UPI payment.

3. **Refund the UPI top-up.** Dodo dashboard → Payments → **Initiate Refund** (full amount).
   - Expect: bonus drops back (floored at what's left — if some were used, the API logs
     `refund clawback clamped`). Policy: **any successful refund of an add-on claws back the
     full pack bonus.**
   - Evidence: `refund.succeeded` in billing-events; bonus value before/after; log line.
   - ⚠️ Dodo UPI may only support **full** refunds — that is fine, it is exactly what we verify.

4. **Refund the card payment.** Initiate a refund for the Scout purchase.
   - Expect: `refund.succeeded` recorded; for subscription payments there is **no automatic
     quota reversal** — the API logs "non-add-on payment; handle in Dodo dashboard". Cancel the
     subscription in the Dodo customer portal and confirm `subscription.cancelled` arrives and
     the plan reverts to free at cycle end.

5. **Invoice / tax (MoR).** Confirm the Dodo tax invoice email arrives for both payments and is
   downloadable from the Dodo dashboard. Confirm with a CA how Dodo's MoR GST reporting covers
   your Indian sales before publishing anything about invoices.

6. **Record.** Paste payment ids, event ids, bonus before/after, and invoice references into
   `LAUNCH_LOG.md` under a G1 row, then mark G1 done in the playbook.

## 3. Evidence endpoints

| Endpoint                                | Auth                           | Shows                                                              |
| --------------------------------------- | ------------------------------ | ------------------------------------------------------------------ |
| `GET /v1/admin/billing-events?limit=50` | admin session (`billing:read`) | every webhook receipt: event id, type, timestamp + per-type counts |
| `GET /v1/billing/me`                    | user session                   | plan, cycle included/bonus/submitted/remaining, recent payments    |

## 4. Rollback

Set `DODO_ENVIRONMENT=test` and redeploy. Refund any live test purchases from the Dodo dashboard
(reversal is automatic for add-ons, manual for plans).

## 5. Automated coverage (already green)

`tests/test_billing_webhook.test.ts`: payment grant, refund clawback (floored), unmapped refund
no-op, `refund.failed` no-op, duplicate-event dedupe, signature rejection (401), missing secret (503).
