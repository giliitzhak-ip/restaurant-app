import { Logo } from '@/components/brand';
import { LoginForm } from './login-form';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  const demoMode = process.env.DEMO_MODE === 'true';

  return (
    <main id="main" className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <Logo showTagline className="mb-8" />
      <LoginForm demoMode={demoMode} />
    </main>
  );
}
