"use client";

import TopNav from "@/components/TopNav";
import { useState, useEffect } from "react";
import BrokerModeToggle from "@/components/broker/BrokerModeToggle";

export default function AlpacaBrokerPage() {
    const [brokerForm, setBrokerForm] = useState({
        broker: 'alpaca',
        apiKey: '',
        apiSecret: '',
        isPaper: true,
    });
    const [brokerStatus, setBrokerStatus] = useState<any>(null);
    const [savingBroker, setSavingBroker] = useState(false);
    const [testingBroker, setTestingBroker] = useState(false);
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    const fetchBrokerStatus = async () => {
        try {
            const res = await fetch('/api/broker/me');
            if (!res.ok) return;
            const data = await res.json();
            setBrokerStatus(data);
        } catch (err) {
            console.error('Failed to load broker status', err);
        }
    };

    useEffect(() => {
        fetchBrokerStatus();
    }, []);

    const saveBrokerKeys = async () => {
        try {
            setSavingBroker(true);
            setFeedback(null);

            const res = await fetch('/api/broker/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(brokerForm),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error((data as any)?.error || 'Failed to save broker keys');
            }

            await fetchBrokerStatus();
            setFeedback({ type: 'success', message: 'Broker keys saved. Run Test Connection to validate them.' });
        } catch (err) {
            console.error(err);
            setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to save broker keys' });
        } finally {
            setSavingBroker(false);
        }
    };

    const testBrokerConnection = async () => {
        try {
            setTestingBroker(true);
            setFeedback(null);

            const res = await fetch('/api/broker/test', {
                method: 'POST',
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                throw new Error((data as any)?.error || (data as any)?.message || 'Broker test failed');
            }

            setFeedback({ type: 'success', message: (data as any)?.message || 'Broker connection healthy' });
        } catch (err) {
            console.error(err);
            setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Broker test failed' });
        } finally {
            setTestingBroker(false);
            await fetchBrokerStatus();
        }
    };
    return (
            <div className="min-h-screen bg-[#0b0f16] text-white">
                <TopNav activePage="alpaca" />
                    <div className="max-w-4xl mx-auto px-4 py-8">
                <div className="bg-[#11151c] border border-gray-700 rounded-3xl p-5 mt-6">
                    <div className="text-lg font-semibold mb-1">Broker Connection</div>
                    <div className="text-sm text-gray-400 mb-4">
                        Connect Alpaca and validate keys with Test Connection before enabling automation.
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm text-gray-400 mb-2">API Key</label>
                            <input
                                type="text"
                                value={brokerForm.apiKey}
                                onChange={(e) =>
                                    setBrokerForm((prev) => ({ ...prev, apiKey: e.target.value }))
                                }
                                className="w-full px-4 py-3 bg-[#1a1f2e] border border-gray-700 rounded-2xl"
                                placeholder="Enter Alpaca API Key"
                            />
                        </div>

                        <div>
                            <label className="block text-sm text-gray-400 mb-2">Secret Key</label>
                            <input
                                type="password"
                                value={brokerForm.apiSecret}
                                onChange={(e) =>
                                    setBrokerForm((prev) => ({ ...prev, apiSecret: e.target.value }))
                                }
                                className="w-full px-4 py-3 bg-[#1a1f2e] border border-gray-700 rounded-2xl"
                                placeholder="Enter Alpaca Secret Key"
                            />
                        </div>
                    </div>

                    <div className="mt-4 flex items-center gap-3">
                        <label className="text-sm text-gray-300">Mode:</label>
                        <button
                            onClick={() => setBrokerForm((prev) => ({ ...prev, isPaper: true }))}
                            className={`px-4 py-2 rounded-xl text-sm ${brokerForm.isPaper ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-gray-300'
                                }`}
                        >
                            Paper
                        </button>
                        <button
                            onClick={() => setBrokerForm((prev) => ({ ...prev, isPaper: false }))}
                            className={`px-4 py-2 rounded-xl text-sm ${!brokerForm.isPaper ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-300'
                                }`}
                        >
                            Live
                        </button>
                    </div>

                    <div className="mt-5 flex gap-3">
                        <button
                            onClick={saveBrokerKeys}
                            disabled={savingBroker}
                            className="px-5 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 rounded-2xl font-medium"
                        >
                            {savingBroker ? 'Saving...' : 'Save Broker Keys'}
                        </button>

                        <button
                            onClick={testBrokerConnection}
                            disabled={testingBroker}
                            className="px-5 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-700 rounded-2xl font-medium"
                        >
                            {testingBroker ? 'Testing...' : 'Test Connection'}
                        </button>
                    </div>

                    {feedback ? (
                        <div
                            className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${
                                feedback.type === 'success'
                                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                                    : 'border-red-500/30 bg-red-500/10 text-red-200'
                            }`}
                        >
                            {feedback.message}
                        </div>
                    ) : null}

                    <div className="mt-5 text-sm">
                        <div className="text-gray-400 mb-2">Current Status</div>

                        {brokerStatus ? (
                            <div className="bg-[#1a1f2e] rounded-2xl p-4 space-y-2">
                                <div>
                                    Broker: <span className="text-white">{brokerStatus.broker}</span>
                                </div>
                                <div>
                                    Mode: <span className="text-white">{brokerStatus.is_paper ? 'Paper' : 'Live'}</span>
                                </div>
                                <div>
                                    Status:{' '}
                                    <span
                                        className={
                                            brokerStatus.connection_status === 'connected'
                                                ? 'text-emerald-400'
                                                : brokerStatus.connection_status === 'failed'
                                                    ? 'text-red-400'
                                                    : 'text-amber-400'
                                        }
                                    >
                                        {brokerStatus.connection_status || 'unknown'}
                                    </span>
                                </div>
                                <div>
                                    Last Tested:{' '}
                                    <span className="text-white">
                                        {brokerStatus.last_tested_at
                                            ? new Date(brokerStatus.last_tested_at).toLocaleString()
                                            : 'Never'}
                                    </span>
                                </div>
                                {brokerStatus.last_error && (
                                    <div className="text-red-400 text-xs">
                                        Error: {brokerStatus.last_error}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="text-gray-500">No broker connected yet.</div>
                        )}
                    </div>
                    <BrokerModeToggle />
                </div>
                </div>
            </div>
    );
}