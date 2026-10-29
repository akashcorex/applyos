import { afterAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import express from 'express';

import * as databaseEnums from '../packages/database/src/enums';

import type { AddressInfo } from 'node:net';

process.env.BETTER_AUTH_SECRET ??= 'test-secret-0123456789abcdef';
process.env.DODO_WEBHOOK_SECRET = 'whsec_test';
process.env.DODO_API_KEY = 'dk_test';
process.env.DODO_ENVIRONMENT = 'test';

const usageCycle = {
  findMany: mock(async () => [] as unknown[]),
  create: mock(async () => ({})),
  update: mock(async () => ({})),
  updateMany: mock(async () => ({ count: 1 })),
};
const processedWebhook = {
  create: mock(async () => ({})),
  delete: mock(async () => ({})),
};
const billingCustomer = {
  upsert: mock(async () => ({})),
  findUnique: mock(async () => null as unknown),
};
const subscription = {
  findFirst: mock(async () => null as unknown),
};

const prismaMock = {
  usageCycle,
  processedWebhook,
  billingCustomer,
  subscription,
};

mock.module('@applyso/database', () => ({
  prisma: prismaMock,
  ...databaseEnums,
}));

let unwrapShouldThrow = false;
const paymentsGet = mock(async () => ({}) as unknown);
const fakeDodoClient = {
  webhooks: {
    unwrap: mock(() => {
      if (unwrapShouldThrow) throw new Error('invalid signature');
    }),
  },
  payments: { retrieve: paymentsGet },
};
const FakeDodoPayments = function FakeDodoPayments() {
  return fakeDodoClient;
};

mock.module('dodopayments', () => ({ default: FakeDodoPayments }));

const { billingWebhookHandler } =
  await import('../apps/api/src/routes/billing');

const app = express();
app.post(
  '/v1/billing/webhook',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    void billingWebhookHandler(req, res).catch(() => {
      res.status(500).json({ error: 'handler threw' });
    });
  },
);

const server = app.listen(0);
const port = (server.address() as AddressInfo).port;
const base = `http://127.0.0.1:${port}/v1/billing/webhook`;

const OPEN_CYCLE = {
  id: 'cycle-1',
  userId: 'user-a',
  cycleStart: new Date(Date.now() - 86400000),
  cycleEnd: new Date(Date.now() + 86400000 * 29),
  includedApplications: 25,
  bonusApplications: 30,
  submittedCount: 0,
};

function postWebhook(payload: unknown, eventId: string) {
  return fetch(base, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'webhook-id': eventId,
      'webhook-signature': 'stub',
      'webhook-timestamp': String(Math.floor(Date.now() / 1000)),
    },
    body: JSON.stringify(payload),
  });
}

beforeEach(() => {
  unwrapShouldThrow = false;
  usageCycle.findMany.mockReset();
  usageCycle.create.mockReset();
  usageCycle.update.mockReset();
  usageCycle.updateMany.mockReset();
  processedWebhook.create.mockReset();
  processedWebhook.delete.mockReset();
  billingCustomer.upsert.mockReset();
  billingCustomer.findUnique.mockReset();
  paymentsGet.mockReset();
  // keep the unwrap implementation (it reads unwrapShouldThrow); clear calls only
  fakeDodoClient.webhooks.unwrap.mockClear();

  usageCycle.findMany.mockResolvedValue([OPEN_CYCLE]);
  usageCycle.updateMany.mockResolvedValue({ count: 1 });
  usageCycle.update.mockResolvedValue({});
  processedWebhook.create.mockResolvedValue({});
  processedWebhook.delete.mockResolvedValue({});
  billingCustomer.upsert.mockResolvedValue({});
  billingCustomer.findUnique.mockResolvedValue(null);
});

afterAll(async () => {
  server.close();
  // restore the real modules so later test files in the same run are unaffected
  const realDatabase = await import('@applyso/database');
  const realDodo = await import('dodopayments');
  mock.module('@applyso/database', () => realDatabase);
  mock.module('dodopayments', () => realDodo);
});

describe('billing webhook', () => {
  it('grants the add-on bonus on payment.succeeded', async () => {
    const res = await postWebhook(
      {
        type: 'payment.succeeded',
        data: {
          payment_id: 'pay_1',
          customer: { customer_id: 'cus_1', email: 'a@b.c' },
          metadata: { userId: 'user-a', addOnPack: 'plus_150' },
        },
      },
      'evt-pay-1',
    );
    expect(res.status).toBe(200);
    expect(usageCycle.update).toHaveBeenCalledTimes(1);
    const args = usageCycle.update.mock.calls[0][0] as {
      where: { id: string };
      data: { bonusApplications: { increment: number } };
    };
    expect(args.where.id).toBe('cycle-1');
    expect(args.data.bonusApplications.increment).toBe(150);
  });

  it('claws back the add-on bonus on refund.succeeded, floored at available bonus', async () => {
    const res = await postWebhook(
      {
        type: 'refund.succeeded',
        data: {
          refund_id: 'ref_1',
          payment_id: 'pay_1',
          is_partial: false,
          status: 'succeeded',
          customer: { customer_id: 'cus_1', email: 'a@b.c' },
          metadata: { userId: 'user-a', addOnPack: 'plus_50' },
        },
      },
      'evt-refund-1',
    );
    expect(res.status).toBe(200);
    expect(usageCycle.updateMany).toHaveBeenCalledTimes(1);
    const args = usageCycle.updateMany.mock.calls[0][0] as {
      where: { id: string; bonusApplications: { gte: number } };
      data: { bonusApplications: { decrement: number } };
    };
    // pack is +50 but the cycle only has 30 bonus left — clamp to 30
    expect(args.data.bonusApplications.decrement).toBe(30);
    // guarded decrement so concurrent refunds cannot go below zero
    expect(args.where.bonusApplications.gte).toBe(30);
  });

  it('recomputes the clawback when a concurrent refund wins the guarded update', async () => {
    usageCycle.findMany.mockReset();
    usageCycle.findMany
      .mockResolvedValueOnce([OPEN_CYCLE])
      .mockResolvedValue([{ ...OPEN_CYCLE, bonusApplications: 5 }]);
    usageCycle.updateMany.mockReset();
    usageCycle.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValue({ count: 1 });
    const res = await postWebhook(
      {
        type: 'refund.succeeded',
        data: {
          refund_id: 'ref_4',
          payment_id: 'pay_1',
          status: 'succeeded',
          metadata: { userId: 'user-a', addOnPack: 'plus_150' },
        },
      },
      'evt-refund-4',
    );
    expect(res.status).toBe(200);
    expect(usageCycle.updateMany).toHaveBeenCalledTimes(2);
    const second = usageCycle.updateMany.mock.calls[1][0] as {
      data: { bonusApplications: { decrement: number } };
    };
    expect(second.data.bonusApplications.decrement).toBe(5);
  });

  it('ignores refunds that cannot be mapped to an add-on pack', async () => {
    const res = await postWebhook(
      {
        type: 'refund.succeeded',
        data: {
          refund_id: 'ref_2',
          customer: { customer_id: 'cus_1' },
          metadata: { userId: 'user-a' },
        },
      },
      'evt-refund-2',
    );
    expect(res.status).toBe(200);
    expect(usageCycle.update).not.toHaveBeenCalled();
  });

  it('does not change the cycle on refund.failed', async () => {
    const res = await postWebhook(
      {
        type: 'refund.failed',
        data: {
          refund_id: 'ref_3',
          metadata: { userId: 'user-a', addOnPack: 'plus_50' },
        },
      },
      'evt-refund-3',
    );
    expect(res.status).toBe(200);
    expect(usageCycle.update).not.toHaveBeenCalled();
  });

  it('acknowledges duplicate events without reprocessing', async () => {
    processedWebhook.create.mockRejectedValue(
      Object.assign(new Error('unique constraint'), { code: 'P2002' }),
    );
    const res = await postWebhook(
      {
        type: 'payment.succeeded',
        data: { metadata: { userId: 'user-a', addOnPack: 'plus_50' } },
      },
      'evt-dup-1',
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { duplicate?: boolean };
    expect(body.duplicate).toBe(true);
    expect(usageCycle.update).not.toHaveBeenCalled();
  });

  it('rejects invalid signatures with 401', async () => {
    unwrapShouldThrow = true;
    const res = await postWebhook(
      { type: 'payment.succeeded', data: {} },
      'evt-bad-sig',
    );
    expect(res.status).toBe(401);
    expect(usageCycle.update).not.toHaveBeenCalled();
  });

  it('returns 503 when the webhook secret is not configured', async () => {
    const original = process.env.DODO_WEBHOOK_SECRET;
    process.env.DODO_WEBHOOK_SECRET = '';
    try {
      const res = await postWebhook(
        { type: 'payment.succeeded', data: {} },
        'evt-no-secret',
      );
      expect(res.status).toBe(503);
    } finally {
      process.env.DODO_WEBHOOK_SECRET = original;
    }
  });
});
