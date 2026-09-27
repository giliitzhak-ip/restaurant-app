import { Redirect } from 'expo-router';
import { useDB } from '@/storage/db';

export default function Index() {
  const done = useDB((s) => s.settings.onboardingDone);
  return <Redirect href={done ? '/home' : '/onboarding'} />;
}
