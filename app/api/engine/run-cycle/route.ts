import { runTradeCycleForAllUsers } from '@/app/lib/engine/runTradeCycleForAllUsers';

export async function GET() {
  try {
    const result = await runTradeCycleForAllUsers();

    if (result.processedUsers === 0) {
      return Response.json({
        success: true,
        message: 'No users found',
        processedUsers: 0,
        totalStocksProcessed: 0,
        usersUpdated: 0,
      });
    }

    return Response.json(result);
  } catch (err) {
    console.error('Engine error:', err);
    return new Response('Error running engine', { status: 500 });
  }
}