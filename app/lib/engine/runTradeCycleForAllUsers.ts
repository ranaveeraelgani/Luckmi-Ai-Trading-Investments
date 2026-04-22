import { supabaseAdmin } from '@/app/lib/supabaseAdmin';
import { runTradeCycleForUser } from '@/app/lib/engine/runTradeCycleForUser';

export async function runTradeCycleForAllUsers() {
  const { data: users, error } = await supabaseAdmin
    .from('profiles')
    .select('user_id');

  if (error) {
    throw error;
  }

  if (!users || users.length === 0) {
    return {
      success: true,
      processedUsers: 0,
      totalStocksProcessed: 0,
      usersUpdated: 0,
      results: [],
    };
  }

  let totalStocksProcessed = 0;
  let usersUpdated = 0;
  const results = [];

  for (const user of users) {
    if (!user?.user_id) continue;

    const result = await runTradeCycleForUser({
      userId: user.user_id,
      runType: 'cron',
      supabase: supabaseAdmin,
    });

    totalStocksProcessed += result.processed;
    if (result.updated) usersUpdated += 1;

    results.push({
      userId: user.user_id,
      ...result,
    });
  }

  return {
    success: true,
    processedUsers: users.length,
    totalStocksProcessed,
    usersUpdated,
    results,
  };
}