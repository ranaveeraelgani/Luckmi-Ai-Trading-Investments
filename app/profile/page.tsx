'use client';

import TopNav from '@/components/TopNav';
import { useEffect, useState } from 'react';
import BrokerStatusCard from "@/components/broker/BrokerStatusCard";
export default function ProfilePage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/profile/me');
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error('Failed to fetch profile', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0b0f16] text-white p-6">
        <div className="max-w-5xl mx-auto text-gray-400">Loading profile...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-[#0b0f16] text-white p-6">
        <div className="max-w-5xl mx-auto text-red-400">Failed to load profile.</div>
      </div>
    );
  }

  const { profile, subscription, summary, lastRun, broker } = data;

  return (
    <div className="min-h-screen bg-[#0b0f16] text-white p-6">
        <TopNav activePage="profile" />
      <div className="max-w-5xl mt-6 mx-auto space-y-6">
        <div className="bg-[#11151c] border border-gray-700 rounded-3xl p-6">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold">{profile.fullName || 'Your Profile'}</h1>
              <div className="text-sm text-gray-400 mt-1">{profile.email}</div>
              <div className="text-xs text-gray-500 mt-2">
                Joined: {profile.createdAt ? new Date(profile.createdAt).toLocaleDateString() : '—'}
              </div>
            </div>

            <div className="text-right">
              <div className="text-sm text-gray-400">Account Type</div>
              <div className="text-lg font-medium">
                {profile.isAdmin ? 'Admin' : 'User'}
              </div>
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-[#11151c] border border-gray-700 rounded-3xl p-6">
            <div className="text-lg font-semibold mb-4">Subscription</div>
            <div className="space-y-2 text-sm">
              <div>Plan: <span className="text-white font-medium">{subscription.planCode}</span></div>
              <div>Status: <span className="text-white font-medium">{subscription.status}</span></div>
              <div>Auto Stocks Limit: <span className="text-white font-medium">{subscription.maxAutoStocks}</span></div>
              <div>Manual Cycle: <span className="text-white font-medium">{subscription.allowManualCycle ? 'On' : 'Off'}</span></div>
              <div>Cron Automation: <span className="text-white font-medium">{subscription.allowCronAutomation ? 'On' : 'Off'}</span></div>
              <div>Broker Access: <span className="text-white font-medium">{subscription.allowBrokerConnect ? 'On' : 'Off'}</span></div>
              <div>Advanced Analytics: <span className="text-white font-medium">{subscription.allowAdvancedAnalytics ? 'On' : 'Off'}</span></div>
            </div>

            {!subscription.enforced && (
              <div className="mt-4 text-xs text-amber-400">
                Test mode active: plan is visible but not enforced.
              </div>
            )}
          </div>

          <div className="bg-[#11151c] border border-gray-700 rounded-3xl p-6">
            <div className="text-lg font-semibold mb-4">Trading Summary</div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[#1a1f2e] rounded-2xl p-4">
                <div className="text-xs text-gray-400">Auto Stocks</div>
                <div className="text-xl font-semibold mt-1">{summary.autoStocks}</div>
              </div>
              <div className="bg-[#1a1f2e] rounded-2xl p-4">
                <div className="text-xs text-gray-400">Open Positions</div>
                <div className="text-xl font-semibold mt-1">{summary.openPositions}</div>
              </div>
              <div className="bg-[#1a1f2e] rounded-2xl p-4">
                <div className="text-xs text-gray-400">Total Trades</div>
                <div className="text-xl font-semibold mt-1">{summary.totalTrades}</div>
              </div>
              <div className="bg-[#1a1f2e] rounded-2xl p-4">
                <div className="text-xs text-gray-400">Realized P&L</div>
                <div className={`text-xl font-semibold mt-1 ${summary.realizedPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {summary.realizedPnL >= 0 ? '+' : ''}${Number(summary.realizedPnL || 0).toFixed(2)}
                </div>
              </div>
            </div>
          </div>
        </div>
            <BrokerStatusCard />
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-[#11151c] border border-gray-700 rounded-3xl p-6">
            <div className="text-lg font-semibold mb-4">Engine Status</div>
            {lastRun ? (
              <div className="space-y-2 text-sm">
                <div>Status: <span className="text-white font-medium">{lastRun.status}</span></div>
                <div>Last Run: <span className="text-white font-medium">{new Date(lastRun.createdAt).toLocaleString()}</span></div>
                <div>Stocks Processed: <span className="text-white font-medium">{lastRun.stocksProcessed}</span></div>
                <div>Trades Executed: <span className="text-white font-medium">{lastRun.tradesExecuted}</span></div>
              </div>
            ) : (
              <div className="text-sm text-gray-400">No engine runs yet.</div>
            )}
          </div>

          <div className="bg-[#11151c] border border-gray-700 rounded-3xl p-6">
            <div className="text-lg font-semibold mb-4">Broker Status</div>
            {broker.connected ? (
              <div className="space-y-2 text-sm">
                <div>Broker: <span className="text-white font-medium">{broker.broker}</span></div>
                <div>Mode: <span className="text-white font-medium">{broker.isPaper ? 'Paper' : 'Live'}</span></div>
                <div>
                  Connection:{' '}
                  <span className={`font-medium ${
                    broker.connectionStatus === 'connected'
                      ? 'text-emerald-400'
                      : broker.connectionStatus === 'failed'
                      ? 'text-red-400'
                      : 'text-amber-400'
                  }`}>
                    {broker.connectionStatus || 'unknown'}
                  </span>
                </div>
                <div>Last Tested: <span className="text-white font-medium">
                  {broker.lastTestedAt ? new Date(broker.lastTestedAt).toLocaleString() : 'Never'}
                </span></div>
                {broker.lastError && (
                  <div className="text-red-400 text-xs">Error: {broker.lastError}</div>
                )}
              </div>
            ) : (
              <div className="text-sm text-gray-400">No broker connected yet.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}