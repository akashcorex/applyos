import { proxyBilling } from '../_proxy';

export async function POST(request: Request) {
  return proxyBilling(request, '/v1/billing/portal', { method: 'POST' });
}
