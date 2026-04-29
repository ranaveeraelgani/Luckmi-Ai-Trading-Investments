import { createClient } from '@/app/lib/supabaseServer';
import {
  getUnreadNotificationCount,
  listUserNotificationEvents,
  markAllNotificationsRead,
} from '@/app/lib/db/notifications';

export async function GET(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return new Response('Unauthorized', { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const limit = Number(searchParams.get('limit') || 50);

    const [events, unreadCount] = await Promise.all([
      listUserNotificationEvents(user.id, limit),
      getUnreadNotificationCount(user.id),
    ]);

    return Response.json({
      events,
      unreadCount,
    });
  } catch (error) {
    console.error('Failed to fetch notifications feed:', error);
    return new Response('Failed to fetch notifications feed', { status: 500 });
  }
}

export async function PATCH() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return new Response('Unauthorized', { status: 401 });
    }

    await markAllNotificationsRead(user.id);
    return Response.json({ success: true });
  } catch (error) {
    console.error('Failed to mark notifications as read:', error);
    return new Response('Failed to mark notifications as read', { status: 500 });
  }
}
