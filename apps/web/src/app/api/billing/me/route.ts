import { proxyBilling } from '../_proxy';

export async function GET(request: Request) {
  return proxyBilling(request, '/v1/billing/me');
}
