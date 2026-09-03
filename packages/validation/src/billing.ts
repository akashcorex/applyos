import * as z from 'zod';

import { nonEmptyString } from './primitives';

/**
 * Billing settings (new centralized contract for the dashboard billing
 * page). Showcases Zod 4.5 `z.creditCard()`: 12–19 digits, optional
 * single spaces/hyphens, valid Luhn checksum.
 */
export const creditCardSchema = z.creditCard({
  error: 'invalid credit card number',
});

export const billingPaymentMethodSchema = z.object({
  cardNumber: creditCardSchema,
  cardholderName: nonEmptyString(120, 'cardholderName'),
  expiryMonth: z
    .number({ error: 'expiryMonth must be a number' })
    .int()
    .min(1)
    .max(12),
  expiryYear: z
    .number({ error: 'expiryYear must be a number' })
    .int()
    .min(new Date().getFullYear())
    .max(new Date().getFullYear() + 20),
  cvc: z
    .string({ error: 'cvc must be a string' })
    .regex(/^\d{3,4}$/, { error: 'invalid cvc' }),
});

export type BillingPaymentMethod = z.input<typeof billingPaymentMethodSchema>;

/** Never log or persist full PANs — validation output stays in memory only. */
export function maskCardNumber(cardNumber: string): string {
  const digits = cardNumber.replace(/[\s-]/g, '');
  return `•••• •••• •••• ${digits.slice(-4)}`;
}

export const compiledBillingPaymentMethodSchema = z.compile(
  billingPaymentMethodSchema,
);
