'use client';

import TopNav from '@/components/TopNav';
import { useEffect, useState } from 'react';
import BrokerStatusCard from "@/components/broker/BrokerStatusCard";

type NotificationPreferences = {
  trade_alerts: boolean;
  score_alerts: boolean;
  broker_alerts: boolean;
  daily_summary: boolean;
  marketing_alerts: boolean;
};

export default function ProfilePage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences | null>(null);
  const [preferencesLoading, setPreferencesLoading] = useState(true);
  const [preferencesSaving, setPreferencesSaving] = useState(false);
  const [preferencesMessage, setPreferencesMessage] = useState<string | null>(null);

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
    (async () => {
      try {
        setPreferencesLoading(true);
        const res = await fetch('/api/notifications/preferences');
        const json = await res.json();
        setNotificationPreferences(json?.preferences || null);
      } catch (error) {
        console.error('Failed to fetch notification preferences', error);
      } finally {
        setPreferencesLoading(false);
      }
    })();
  }, []);

  const onTogglePreference = (key: keyof NotificationPreferences) => {
    setNotificationPreferences((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        [key]: !prev[key],
      };
    });
  };

  const savePreferences = async () => {
    if (!notificationPreferences) return;

    try {
      setPreferencesSaving(true);
      setPreferencesMessage(null);

      const res = await fetch('/api/notifications/preferences', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(notificationPreferences),
      });

      if (!res.ok) {
        throw new Error('Failed to save preferences');
      }

      const json = await res.json();
      setNotificationPreferences(json?.preferences || notificationPreferences);
      setPreferencesMessage('Notification preferences saved.');
    } catch (error) {
      console.error('Failed to save notification preferences', error);
      setPreferencesMessage('Failed to save preferences. Please retry.');
    } finally {
      setPreferencesSaving(false);
    }
  };

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
          <div className="bg-[#11151c] border border-gray-700 rounded-3xl p-6 md:col-span-2">
            <div className="flex items-center justify-between gap-4 mb-4">
              <div>
                <div className="text-lg font-semibold">Notification Preferences</div>
                <div className="text-xs text-gray-400 mt-1">
                  API here means backend endpoints used by the app. You can still add a bell icon later; these toggles control delivery rules.
                </div>
              </div>
              <button
                onClick={savePreferences}
                disabled={preferencesLoading || preferencesSaving || !notificationPreferences}
                className="px-4 py-2 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-sm disabled:opacity-50"
              >
                {preferencesSaving ? 'Saving...' : 'Save'}
              </button>
            </div>

            {preferencesLoading ? (
              <div className="text-sm text-gray-400">Loading notification settings...</div>
            ) : !notificationPreferences ? (
              <div className="text-sm text-red-400">Failed to load notification settings.</div>
            ) : (
              <div className="grid md:grid-cols-2 gap-3 text-sm">
                <label className="flex items-center justify-between bg-[#1a1f2e] rounded-xl px-4 py-3">
                  <span>Trade Alerts</span>
                  <input
                    type="checkbox"
                    checked={notificationPreferences.trade_alerts}
                    onChange={() => onTogglePreference('trade_alerts')}
                  />
                </label>
                <label className="flex items-center justify-between bg-[#1a1f2e] rounded-xl px-4 py-3">
                  <span>Broker Alerts</span>
                  <input
                    type="checkbox"
                    checked={notificationPreferences.broker_alerts}
                    onChange={() => onTogglePreference('broker_alerts')}
                  />
                </label>
                <label className="flex items-center justify-between bg-[#1a1f2e] rounded-xl px-4 py-3">
                  <span>Score Alerts</span>
                  <input
                    type="checkbox"
                    checked={notificationPreferences.score_alerts}
                    onChange={() => onTogglePreference('score_alerts')}
                  />
                </label>
                <label className="flex items-center justify-between bg-[#1a1f2e] rounded-xl px-4 py-3">
                  <span>Daily Summary</span>
                  <input
                    type="checkbox"
                    checked={notificationPreferences.daily_summary}
                    onChange={() => onTogglePreference('daily_summary')}
                  />
                </label>
                <label className="flex items-center justify-between bg-[#1a1f2e] rounded-xl px-4 py-3 md:col-span-2">
                  <span>Marketing Alerts</span>
                  <input
                    type="checkbox"
                    checked={notificationPreferences.marketing_alerts}
                    onChange={() => onTogglePreference('marketing_alerts')}
                  />
                </label>
              </div>
            )}

            {preferencesMessage && (
              <div className="text-xs text-gray-400 mt-3">{preferencesMessage}</div>
            )}
          </div>

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