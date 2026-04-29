import { NextResponse } from 'next/server';
import { createNotificationService } from '@/app/lib/notifications/service';

const JOB_NAME = 'notifications-dispatch';

export async function GET(req: Request) {
  try {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${process.env.ENGINE_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const limitRaw = Number(searchParams.get('limit') || 100);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 300) : 100;

    const service = createNotificationService();
    const result = await service.processPending(limit);

    console.info(`[cron:${JOB_NAME}] processed=${result.processed} sent=${result.sent} failed=${result.failed}`);

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error: any) {
    const message = error?.message || 'Notification dispatch failed';
    console.error(`[cron:${JOB_NAME}] failed message=${message}`);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
