import { NextResponse, type NextRequest } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';
import { getSessionContext, homePathFor } from '@/lib/auth/session';

/**
 * Exchanges the email-confirmation / magic-link code for a session, then sends
 * the user to the home screen that matches their role.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const next = searchParams.get('next');

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await getServerSupabase();
  if (!supabase) {
    return NextResponse.redirect(`${origin}/login?error=not_configured`);
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=invalid_code`);
  }

  if (next && next.startsWith('/')) {
    return NextResponse.redirect(`${origin}${next}`);
  }

  const session = await getSessionContext();
  return NextResponse.redirect(`${origin}${session ? homePathFor(session.role) : '/app'}`);
}
