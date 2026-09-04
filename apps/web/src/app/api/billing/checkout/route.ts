import { proxyBilling } from '../_proxy';

export async function POST(request: Request) {
  const body = await request.text();
  return proxyBilling(request, '/v1/billing/checkout', {
    method: 'POST',
    body,
  });
}
