'use client';

import { useEffect, useMemo, useState } from 'react';
import TopNav from '@/components/TopNav';

type FeedEvent = {
  id: string;
  title: string;
  body: string;
  type: string;
  status: string;
  url: string | null;
  created_at: string;
  read_at: string | null;
};

function typeBadge(type: string) {
  if (type === 'trade_filled') return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
  if (type === 'trade_skipped_safety') return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
  if (type === 'broker_sync_failed') return 'bg-red-500/15 text-red-300 border-red-500/30';
  return 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30';
}

export default function NotificationsPage() {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [markingRead, setMarkingRead] = useState(false);

  const fetchFeed = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/notifications/feed?limit=100', { cache: 'no-store' });
      const json = await res.json();
      setEvents(json?.events || []);
      setUnreadCount(Number(json?.unreadCount || 0));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeed();
  }, []);

  const grouped = useMemo(() => {
    const out: Record<string, FeedEvent[]> = {};
    for (const e of events) {
      const key = new Date(e.created_at).toLocaleDateString();
      if (!out[key]) out[key] = [];
      out[key].push(e);
    }
    return out;
  }, [events]);

  const onMarkAllRead = async () => {
    setMarkingRead(true);
    try {
      const res = await fetch('/api/notifications/feed', { method: 'PATCH' });
      if (res.ok) {
        setEvents((prev) => prev.map((e) => ({ ...e, read_at: e.read_at || new Date().toISOString() })));
        setUnreadCount(0);
      }
    } finally {
      setMarkingRead(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0f16] text-white">
      <TopNav activePage="notifications" />

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#11151c] via-[#0f141d] to-[#111827] p-6">
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="absolute -left-10 -bottom-10 h-40 w-40 rounded-full bg-emerald-400/10 blur-3xl" />

          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
              <p className="mt-1 text-sm text-gray-400">
                Trade fills, safety alerts, and broker sync signals in one stream.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-300">
                {unreadCount} unread
              </div>
              <button
                onClick={onMarkAllRead}
                disabled={markingRead || unreadCount === 0}
                className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-gray-200 transition hover:bg-white/10 disabled:opacity-50"
              >
                {markingRead ? 'Marking...' : 'Mark all read'}
              </button>
            </div>
          </div>
        </section>

        <section className="mt-6 space-y-6">
          {loading ? (
            <div className="rounded-2xl border border-white/10 bg-[#11151c] p-6 text-sm text-gray-400">
              Loading notifications...
            </div>
          ) : events.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-[#11151c] p-6 text-sm text-gray-400">
              No notifications yet.
            </div>
          ) : (
            Object.entries(grouped).map(([day, items]) => (
              <div key={day}>
                <div className="mb-3 text-xs uppercase tracking-wider text-gray-500">{day}</div>
                <div className="space-y-3">
                  {items.map((event) => (
                    <a
                      key={event.id}
                      href={event.url || '/notifications'}
                      className={`block rounded-2xl border p-4 transition ${
                        event.read_at
                          ? 'border-white/10 bg-[#11151c] hover:bg-[#151b26]'
                          : 'border-cyan-500/30 bg-cyan-500/5 hover:bg-cyan-500/10'
                      }`}
                    >
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold uppercase ${typeBadge(event.type)}`}>
                          {event.type.replaceAll('_', ' ')}
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(event.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {!event.read_at && (
                          <span className="ml-auto rounded-full bg-cyan-400/20 px-2 py-0.5 text-[10px] font-semibold text-cyan-300">
                            New
                          </span>
                        )}
                      </div>

                      <div className="text-sm font-semibold text-white">{event.title}</div>
                      <div className="mt-1 text-sm text-gray-300">{event.body}</div>
                    </a>
                  ))}
                </div>
              </div>
            ))
          )}
        </section>
      </main>
    </div>
  );
}
