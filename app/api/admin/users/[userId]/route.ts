import { supabaseAdmin } from '@/app/lib/supabaseAdmin';
import { requireAdmin } from '@/app/lib/auth/admin';
import { runTradeCycleForUser } from '@/app/lib/engine/runTradeCycleForUser';

type RouteContext = {
  params: Promise<{ userId: string }>;
};

export async function POST(_req: Request, context: RouteContext) {
  try {
    await requireAdmin();

    const { userId } = await context.params;

    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('user_id, email')
      .eq('user_id', userId)
      .single();

    if (error || !profile) {
      return Response.json({ success: false, message: 'User not found' }, { status: 404 });
    }

    const result = await runTradeCycleForUser({
      userId,
      runType: 'admin',
      supabase: supabaseAdmin,
      bypassPlanChecks: true,
      bypassCooldown: true,
    });

    if (result.status === 'failed') {
      return Response.json(
        { success: false, message: result.message || 'Admin run failed' },
        { status: 500 }
      );
    }

    return Response.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return Response.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    if (error instanceof Error && error.message === 'Forbidden') {
      return Response.json({ success: false, message: 'Forbidden' }, { status: 403 });
    }

    return Response.json(
      { success: false, message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}