import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { JWTService } from '@/lib/auth/jwt';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/auth/me
 *
 * Returns the currently authenticated user's info including profile data.
 * Used by the client-side AuthProvider to populate user context,
 * which enables credit balance queries and other auth-dependent hooks.
 */
export async function GET() {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('bfeai_session');

    if (!sessionCookie?.value) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    let payload;
    try {
      payload = JWTService.verifySSOToken(sessionCookie.value);
    } catch {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    if (payload.exp && payload.exp * 1000 < Date.now()) {
      return NextResponse.json({ error: 'Session expired' }, { status: 401 });
    }

    const supabase = createAdminClient();

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, full_name, avatar_url, company, industry, created_at, updated_at')
      .eq('id', payload.userId)
      .single();

    if (profileError) {
      console.error('[/api/auth/me] Profile fetch error:', profileError);
      return NextResponse.json({
        userId: payload.userId,
        email: payload.email,
        profile: null,
      });
    }

    return NextResponse.json({
      userId: payload.userId,
      email: payload.email,
      profile: {
        id: profile.id,
        email: profile.email,
        fullName: profile.full_name,
        avatarUrl: profile.avatar_url,
        company: profile.company,
        industry: profile.industry,
        createdAt: profile.created_at,
        updatedAt: profile.updated_at,
      },
    });
  } catch (error) {
    console.error('[/api/auth/me] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
