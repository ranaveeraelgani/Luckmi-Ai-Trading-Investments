import { NextResponse } from 'next/server';
import { createNotificationService } from '@/app/lib/notifications/service';

export async function GET(req: Request) {
  try {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${process.env.ENGINE_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const limitRaw = Number(searchParams.get('limit') || 50);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;

    const service = createNotificationService();
    const result = await service.processPending(limit);

    return NextResponse.json({ success: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to dispatch notifications';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
