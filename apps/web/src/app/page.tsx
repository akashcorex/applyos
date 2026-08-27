import EarlyAccessPage from '../components/EarlyAccessPage';
import LandingPage from '../components/landing';

export default function Index() {
  if (process.env.EARLY_ACCESS_MODE === 'true') {
    return <EarlyAccessPage />;
  }

  return <LandingPage />;
}
