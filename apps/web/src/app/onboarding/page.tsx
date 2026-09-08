import { redirect } from 'next/navigation';

export const metadata = {
  title: 'Set up your profile — ApplyOS',
};

export default function OnboardingPage() {
  redirect('/dashboard');
}
