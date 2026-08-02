import { redirect } from 'next/navigation';

import EarlyAccessPage from '../components/EarlyAccessPage';

export default function Index() {
  if (process.env.EARLY_ACCESS_MODE === 'true') {
    return <EarlyAccessPage />;
  }

  redirect('/login');
}
