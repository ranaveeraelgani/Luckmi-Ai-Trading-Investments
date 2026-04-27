'use client';

import { useEffect, useState } from 'react';
import TopNav from '@/components/TopNav';

type AdminUser = {
    user_id: string;
    full_name: string | null;
    email: string | null;
    is_admin: boolean;
    stockCount: number;
    subscription: {
        plan_code: string;
        status: string;
        max_auto_stocks: number;
        allow_manual_cycle: boolean;
        allow_cron_automation: boolean;
        allow_broker_connect: boolean;
        allow_advanced_analytics: boolean;
        engine_paused?: boolean;
    } | null;
    lastRun: {
        status: string;
        created_at: string;
        stocks_processed: number;
        trades_executed: number;
    } | null;
    broker: {
        broker: string;
        is_paper: boolean;
        created_at: string;
        connection_status?: string;
        last_tested_at?: string | null;
        last_error?: string | null;
    } | null;
};

const PLAN_PRESETS: Record<string, any> = {
    free: {
        planCode: 'free',
        status: 'active',
        maxAutoStocks: 0,
        allowManualCycle: false,
        allowCronAutomation: false,
        allowBrokerConnect: false,
        allowAdvancedAnalytics: false,
        enginePaused: false,
    },
    pro_3: {
        planCode: 'pro_3',
        status: 'active',
        maxAutoStocks: 3,
        allowManualCycle: true,
        allowCronAutomation: true,
        allowBrokerConnect: true,
        allowAdvancedAnalytics: true,
        enginePaused: false,
    },
    pro_5: {
        planCode: 'pro_5',
        status: 'active',
        maxAutoStocks: 5,
        allowManualCycle: true,
        allowCronAutomation: true,
        allowBrokerConnect: true,
        allowAdvancedAnalytics: true,
        enginePaused: false,
    },
    pro_10: {
        planCode: 'pro_10',
        status: 'active',
        maxAutoStocks: 10,
        allowManualCycle: true,
        allowCronAutomation: true,
        allowBrokerConnect: true,
        allowAdvancedAnalytics: true,
        enginePaused: false,
    },
    test_unlimited: {
        planCode: 'test_unlimited',
        status: 'active',
        maxAutoStocks: 999,
        allowManualCycle: true,
        allowCronAutomation: true,
        allowBrokerConnect: true,
        allowAdvancedAnalytics: true,
        enginePaused: false,
    },
};

export default function AdminPage() {
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [savingUserId, setSavingUserId] = useState<string | null>(null);
    const [notes, setNotes] = useState<Record<string, string>>({});

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/users');
            const data = await res.json();
            setUsers(data || []);
        } catch (err) {
            console.error('Failed to fetch admin users', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const updatePlan = async (targetUserId: string, planCode: string) => {
        try {
            setSavingUserId(targetUserId);

            const preset = PLAN_PRESETS[planCode];

            const res = await fetch('/api/admin/subscription/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    targetUserId,
                    ...preset,
                }),
            });

            if (!res.ok) throw new Error('Failed to update plan');

            await fetchUsers();
        } catch (err) {
            console.error(err);
            alert('Failed to update plan');
        } finally {
            setSavingUserId(null);
        }
    };

    const toggleEnginePaused = async (user: AdminUser) => {
        try {
            setSavingUserId(user.user_id);

            const current = user.subscription;
            if (!current) return;

            const res = await fetch('/api/admin/subscription/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    targetUserId: user.user_id,
                    planCode: current.plan_code,
                    status: current.status,
                    maxAutoStocks: current.max_auto_stocks,
                    allowManualCycle: current.allow_manual_cycle,
                    allowCronAutomation: current.allow_cron_automation,
                    allowBrokerConnect: current.allow_broker_connect,
                    allowAdvancedAnalytics: current.allow_advanced_analytics,
                    enginePaused: !current.engine_paused,
                }),
            });

            if (!res.ok) throw new Error('Failed to toggle engine pause');

            await fetchUsers();
        } catch (err) {
            console.error(err);
            alert('Failed to toggle engine pause');
        } finally {
            setSavingUserId(null);
        }
    };

    const saveNote = async (targetUserId: string) => {
        const note = notes[targetUserId]?.trim();
        if (!note) return;

        try {
            setSavingUserId(targetUserId);

            const res = await fetch('/api/admin/notes/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetUserId, note }),
            });

            if (!res.ok) throw new Error('Failed to save note');

            setNotes((prev) => ({ ...prev, [targetUserId]: '' }));
            alert('Note saved');
        } catch (err) {
            console.error(err);
            alert('Failed to save note');
        } finally {
            setSavingUserId(null);
        }
    };

    return (
        <div className="min-h-screen bg-[#0b0f16] text-white">
            <TopNav activePage="admin" />
            <div className="p-6">
                <div className="max-w-7xl mx-auto">
                    <div className="mb-6">
                        <h1 className="text-2xl font-semibold">Admin</h1>
                        <p className="text-sm text-gray-400 mt-1">
                            Manage plans, engine safety, broker status, and internal notes.
                        </p>
                    </div>

                    {loading ? (
                        <div className="text-gray-400">Loading users...</div>
                    ) : (
                        <div className="space-y-5">
                            {users.map((user) => (
                                <div
                                    key={user.user_id}
                                    className="bg-[#11151c] border border-gray-700 rounded-3xl p-5"
                                >
                                    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                                        <div>
                                            <div className="text-lg font-semibold">
                                                {user.full_name || 'Unnamed User'}
                                            </div>
                                            <div className="text-sm text-gray-400">{user.email || '—'}</div>
                                            <div className="text-xs text-gray-500 mt-1 break-all">
                                                {user.user_id}
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm min-w-[320px]">
                                            <div className="bg-[#1a1f2e] rounded-2xl p-3">
                                                <div className="text-gray-400 text-xs">Plan</div>
                                                <div className="font-medium">
                                                    {user.subscription?.plan_code || 'none'}
                                                </div>
                                            </div>

                                            <div className="bg-[#1a1f2e] rounded-2xl p-3">
                                                <div className="text-gray-400 text-xs">Stocks</div>
                                                <div className="font-medium">{user.stockCount}</div>
                                            </div>

                                            <div className="bg-[#1a1f2e] rounded-2xl p-3">
                                                <div className="text-gray-400 text-xs">Broker</div>
                                                <div className="font-medium">
                                                    {user.broker ? `${user.broker.broker} (${user.broker.is_paper ? 'Paper' : 'Live'})` : 'Not Connected'}
                                                </div>
                                                <div className="bg-[#1a1f2e] rounded-2xl p-4">
                                                    <div className="text-sm font-medium mb-3">Broker Health</div>
                                                    {user.broker ? (
                                                        <div className="space-y-2 text-xs text-gray-300">
                                                            <div>Broker: {user.broker.broker}</div>
                                                            <div>Mode: {user.broker.is_paper ? 'Paper' : 'Live'}</div>
                                                            <div>
                                                                Status:{' '}
                                                                <span
                                                                    className={
                                                                        user.broker.connection_status === 'connected'
                                                                            ? 'text-emerald-400'
                                                                            : user.broker.connection_status === 'failed'
                                                                                ? 'text-red-400'
                                                                                : 'text-amber-400'
                                                                    }
                                                                >
                                                                    {user.broker.connection_status || 'unknown'}
                                                                </span>
                                                            </div>
                                                            <div>
                                                                Last Tested:{' '}
                                                                {user.broker.last_tested_at
                                                                    ? new Date(user.broker.last_tested_at).toLocaleString()
                                                                    : 'Never'}
                                                            </div>
                                                            {user.broker.last_error && (
                                                                <div className="text-red-400 text-[11px] line-clamp-3">
                                                                    Error: {user.broker.last_error}
                                                                </div>
                                                            )}

                                                            <button
                                                                onClick={async () => {
                                                                    try {
                                                                        setSavingUserId(user.user_id);

                                                                        const res = await fetch('/api/admin/broker/test', {
                                                                            method: 'POST',
                                                                            headers: { 'Content-Type': 'application/json' },
                                                                            body: JSON.stringify({ targetUserId: user.user_id }),
                                                                        });

                                                                        if (!res.ok) {
                                                                            const errText = await res.text();
                                                                            throw new Error(errText);
                                                                        }

                                                                        await fetchUsers();
                                                                        alert('Broker health test completed');
                                                                    } catch (err) {
                                                                        console.error(err);
                                                                        alert('Broker health test failed');
                                                                    } finally {
                                                                        setSavingUserId(null);
                                                                    }
                                                                }}
                                                                disabled={savingUserId === user.user_id}
                                                                className="mt-2 w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 px-4 py-2 rounded-xl text-sm font-medium"
                                                            >
                                                                Test Broker Connection
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div className="text-xs text-gray-400">No broker connected</div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="bg-[#1a1f2e] rounded-2xl p-3">
                                                <div className="text-gray-400 text-xs">Last Run</div>
                                                <div className="font-medium">
                                                    {user.lastRun ? user.lastRun.status : '—'}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-5 grid md:grid-cols-3 gap-4">
                                        <div className="bg-[#1a1f2e] rounded-2xl p-4">
                                            <div className="text-sm font-medium mb-3">Plan Controls</div>

                                            <select
                                                defaultValue={user.subscription?.plan_code || 'free'}
                                                onChange={(e) => updatePlan(user.user_id, e.target.value)}
                                                className="w-full bg-[#11151c] border border-gray-700 rounded-xl px-3 py-2 text-sm"
                                                disabled={savingUserId === user.user_id}
                                            >
                                                <option value="free">free</option>
                                                <option value="pro_3">pro_3</option>
                                                <option value="pro_5">pro_5</option>
                                                <option value="pro_10">pro_10</option>
                                                <option value="test_unlimited">test_unlimited</option>
                                            </select>

                                            <button
                                                onClick={() => toggleEnginePaused(user)}
                                                disabled={savingUserId === user.user_id || !user.subscription}
                                                className="mt-3 w-full bg-amber-600 hover:bg-amber-700 disabled:bg-gray-700 px-4 py-2 rounded-xl text-sm font-medium"
                                            >
                                                {user.subscription?.engine_paused ? 'Resume Engine' : 'Pause Engine'}
                                            </button>
                                        </div>

                                        <div className="bg-[#1a1f2e] rounded-2xl p-4">
                                            <div className="text-sm font-medium mb-3">Subscription Flags</div>
                                            <div className="space-y-2 text-xs text-gray-300">
                                                <div>Manual: {user.subscription?.allow_manual_cycle ? 'On' : 'Off'}</div>
                                                <div>Cron: {user.subscription?.allow_cron_automation ? 'On' : 'Off'}</div>
                                                <div>Broker: {user.subscription?.allow_broker_connect ? 'On' : 'Off'}</div>
                                                <div>Analytics: {user.subscription?.allow_advanced_analytics ? 'On' : 'Off'}</div>
                                                <div>Status: {user.subscription?.status || '—'}</div>
                                            </div>
                                        </div>

                                        <div className="bg-[#1a1f2e] rounded-2xl p-4">
                                            <div className="text-sm font-medium mb-3">Admin Notes</div>
                                            <textarea
                                                value={notes[user.user_id] || ''}
                                                onChange={(e) =>
                                                    setNotes((prev) => ({
                                                        ...prev,
                                                        [user.user_id]: e.target.value,
                                                    }))
                                                }
                                                className="w-full min-h-[90px] bg-[#11151c] border border-gray-700 rounded-xl px-3 py-2 text-sm"
                                                placeholder="Add internal note..."
                                            />
                                            <button
                                                onClick={() => saveNote(user.user_id)}
                                                disabled={savingUserId === user.user_id}
                                                className="mt-3 w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 px-4 py-2 rounded-xl text-sm font-medium"
                                            >
                                                Save Note
                                            </button>
                                        </div>
                                    </div>

                                    {user.lastRun && (
                                        <div className="mt-4 text-xs text-gray-400">
                                            Last engine run: {new Date(user.lastRun.created_at).toLocaleString()} •
                                            {' '}Processed: {user.lastRun.stocks_processed} •
                                            {' '}Trades: {user.lastRun.trades_executed}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}