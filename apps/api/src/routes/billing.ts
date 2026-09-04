import { Router } from 'express';

import { prisma } from '@applyso/database';
import {
  billingCheckoutSchema,
  validateBody,
  type BillingCheckoutInput,
} from '@applyso/validation';

import { authUserOf, requireAuth } from '../lib/authz';
import { billingSummaryForUser, handleDodoWebhookEvent } from '../lib/billing';
import {
  billingReturnUrl,
  getDodoClient,
  productIdForAddOn,
  productIdForPlan,
} from '../lib/dodo';

import type { Request, Response } from 'express';

function headerValue(req: Request, name: string): string {
  const value = req.headers[name];
  return typeof value === 'string' ? value : '';
}

function rawBodyString(body: unknown): string {
  if (Buffer.isBuffer(body)) return body.toString('utf8');
  if (typeof body === 'string') return body;
  return '';
}

export async function billingWebhookHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const raw = rawBodyString(req.body);
  const webhookId = headerValue(req, 'webhook-id');
  const webhookSignature = headerValue(req, 'webhook-signature');
  const webhookTimestamp = headerValue(req, 'webhook-timestamp');

  if (!process.env.DODO_WEBHOOK_SECRET) {
    res.status(503).json({ error: 'Webhook is not configured' });
    return;
  }

  try {
    const client = getDodoClient();
    client.webhooks.unwrap(raw, {
      headers: {
        'webhook-id': webhookId,
        'webhook-signature': webhookSignature,
        'webhook-timestamp': webhookTimestamp,
      },
    });
  } catch (error) {
    console.warn('[billing] webhook signature rejected:', error);
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  let parsed: { type?: unknown; data?: unknown };
  try {
    parsed = JSON.parse(raw) as { type?: unknown; data?: unknown };
  } catch {
    res.status(400).json({ error: 'Invalid JSON' });
    return;
  }

  const type = typeof parsed.type === 'string' ? parsed.type : '';
  const eventId = webhookId || `${type}:${raw.slice(0, 64)}`;

  try {
    await prisma.processedWebhook.create({
      data: { dodoEventId: eventId, eventType: type || 'unknown' },
    });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'P2002') {
      res.status(200).json({ received: true, duplicate: true });
      return;
    }
    throw error;
  }

  const data =
    parsed.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data)
      ? (parsed.data as Record<string, unknown>)
      : {};

  try {
    await handleDodoWebhookEvent(type, data);
  } catch (error) {
    console.error('[billing] webhook handler failed:', error);
    await prisma.processedWebhook
      .delete({ where: { dodoEventId: eventId } })
      .catch(() => undefined);
    res.status(500).json({ error: 'Webhook processing failed' });
    return;
  }

  res.status(200).json({ received: true });
}

export const billingRouter = Router();

billingRouter.use(requireAuth);

billingRouter.get('/me', async (req, res) => {
  const user = authUserOf(req);
  const summary = await billingSummaryForUser(user.id);
  res.json(summary);
});

billingRouter.post(
  '/checkout',
  validateBody(billingCheckoutSchema),
  async (req, res) => {
  const body = req.validatedBody as BillingCheckoutInput;
  const user = authUserOf(req);

  const account = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      email: true,
      name: true,
      billingCustomer: { select: { dodoCustomerId: true } },
    },
  });
  if (!account) {
    res.status(404).json({ error: 'Account not found' });
    return;
  }

  let productId: string;
  const metadata: Record<string, string> = { userId: user.id };
  try {
    if (body.addOnPack) {
      productId = productIdForAddOn(body.addOnPack);
      metadata.addOnPack = body.addOnPack;
    } else if (body.plan && body.interval) {
      productId = productIdForPlan(body.plan, body.interval);
      metadata.plan = body.plan;
      metadata.interval = body.interval;
    } else {
      res.status(400).json({ error: 'Invalid checkout request' });
      return;
    }
  } catch (error) {
    console.error('[billing] product mapping missing:', error);
    res.status(503).json({ error: 'Billing products are not configured' });
    return;
  }

  const customer = account.billingCustomer?.dodoCustomerId
    ? { customer_id: account.billingCustomer.dodoCustomerId }
    : { email: account.email, name: account.name || account.email };

  try {
    const client = getDodoClient();
    const session = await client.checkoutSessions.create({
      product_cart: [{ product_id: productId, quantity: 1 }],
      customer,
      return_url: billingReturnUrl('success'),
      cancel_url: billingReturnUrl('cancelled'),
      metadata,
      discount_codes: body.couponCode ? [body.couponCode] : undefined,
      feature_flags: { allow_discount_code: true },
    });
    const checkoutUrl =
      (session as { checkout_url?: string }).checkout_url ?? null;
    if (!checkoutUrl) {
      res.status(502).json({ error: 'Checkout session did not return a URL' });
      return;
    }
    res.json({ checkoutUrl });
  } catch (error) {
    console.error('[billing] checkout session failed:', error);
    res.status(502).json({ error: 'Failed to create checkout session' });
  }
});

billingRouter.post('/portal', async (req, res) => {
  const user = authUserOf(req);
  const customer = await prisma.billingCustomer.findUnique({
    where: { userId: user.id },
    select: { dodoCustomerId: true },
  });
  if (!customer) {
    res.status(404).json({ error: 'No billing customer yet' });
    return;
  }

  try {
    const client = getDodoClient();
    const session = await client.customers.customerPortal.create(
      customer.dodoCustomerId,
    );
    const portalUrl = (session as { link?: string }).link ?? null;
    if (!portalUrl) {
      res.status(502).json({ error: 'Customer portal did not return a URL' });
      return;
    }
    res.json({ portalUrl });
  } catch (error) {
    console.error('[billing] customer portal failed:', error);
    res.status(502).json({ error: 'Failed to open customer portal' });
  }
});
