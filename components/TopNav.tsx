"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";
import LuckmiLogo from "@/components/brand/LuckmiLogo";

type ActivePage =
  | "dashboard"
  | "watchlist"
  | "portfolio"
  | "auto"
  | "picks"
  | "options"
  | "reports"
  | "profile"
  | "alpaca"
  | "admin-reports"
  | "admin-users"
  | "user-guide"
  | "notifications";

type TopNavProps = {
  activePage?: ActivePage;
};

const navItems: { label: string; href: string; key: ActivePage }[] = [
  { label: "Dashboard", href: "/dashboard", key: "dashboard" },
  { label: "Picks", href: "/picks", key: "picks" },
  { label: "Watchlist", href: "/watchlist", key: "watchlist" },
  { label: "Portfolio", href: "/portfolio", key: "portfolio" },
  { label: "Auto Trading", href: "/auto", key: "auto" },
  { label: "Reports", href: "/reports", key: "reports" },
];

export default function TopNav({ activePage }: TopNavProps) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);
  const accountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    async function fetchAdminStatus() {
      try {
        const res = await fetch("/api/admin/me", { cache: "no-store" });
        if (!res.ok) return;

        const data = await res.json();
        setIsAdmin(Boolean(data?.isAdmin));
      } catch {
        setIsAdmin(false);
      }
    }

    fetchAdminStatus();
  }, []);

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    async function fetchUnreadCount() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.user) {
          setUnreadCount(0);
          return;
        }

        const res = await fetch('/api/notifications/feed?limit=1', { cache: 'no-store' });
        if (!res.ok) {
          setUnreadCount(0);
          return;
        }
        const data = await res.json();
        setUnreadCount(Number(data?.unreadCount || 0));
      } catch {
        setUnreadCount(0);
      }
    }

    fetchUnreadCount();

    const interval = window.setInterval(fetchUnreadCount, 15000);
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') {
        fetchUnreadCount();
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', fetchUnreadCount);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', fetchUnreadCount);
    };
  }, []);

  useEffect(() => {
    function closeDropdown(e: MouseEvent) {
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) {
        setShowAccountDropdown(false);
      }
    }

    document.addEventListener("mousedown", closeDropdown);
    return () => document.removeEventListener("mousedown", closeDropdown);
  }, []);

  async function handleLogout() {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  function navClass(key: ActivePage) {
    return `rounded-full px-3 py-2 text-sm font-medium transition ${
      activePage === key
        ? "bg-emerald-500/10 text-emerald-300"
        : "text-gray-300 hover:bg-white/5 hover:text-white"
    }`;
  }

  function mobileNavClass(key: ActivePage) {
    return `block rounded-2xl px-4 py-3 text-base font-medium transition ${
      activePage === key
        ? "bg-emerald-500/10 text-emerald-300"
        : "text-gray-300 hover:bg-white/5 hover:text-white"
    }`;
  }

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-white/5 bg-[#0F1117]/90 backdrop-blur-xl">
        <div className="flex h-16 items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              className="rounded-xl p-2 text-gray-400 transition hover:bg-white/5 hover:text-white lg:hidden"
              aria-label="Open menu"
            >
              ☰
            </button>

            <Link href="/dashboard" className="transition hover:opacity-90">
              <LuckmiLogo showText size={38} />
            </Link>
          </div>

          <nav className="hidden items-center gap-1 lg:flex">
            {navItems.map((item) => (
              <Link key={item.key} href={item.href} className={navClass(item.key)}>
                {item.label}
              </Link>
            ))}

            {isAdmin && (
              <>
                <Link
                  href="/admin/reports"
                  className={`rounded-full px-3 py-2 text-sm font-medium transition ${
                    activePage === "admin-reports"
                      ? "bg-amber-500/10 text-amber-300"
                      : "text-amber-300 hover:bg-white/5 hover:text-amber-200"
                  }`}
                >
                  Admin Reports
                </Link>
                <Link
                  href="/admin/users"
                  className={`rounded-full px-3 py-2 text-sm font-medium transition ${
                    activePage === "admin-users"
                      ? "bg-amber-500/10 text-amber-300"
                      : "text-amber-300 hover:bg-white/5 hover:text-amber-200"
                  }`}
                >
                  Admin Users
                </Link>
              </>
            )}
          </nav>

          <div className="hidden items-center gap-3 lg:flex">
            <Link
              href="/notifications"
              className={`relative rounded-xl border px-3 py-2 text-sm transition ${
                activePage === 'notifications'
                  ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200'
                  : 'border-white/10 bg-white/5 text-gray-200 hover:bg-white/10'
              }`}
            >
              <span aria-hidden>🔔</span>
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </Link>

            <div className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
              ● Paper Trading
            </div>

            <div className="relative" ref={accountRef}>
              <button
                type="button"
                onClick={() => setShowAccountDropdown((prev) => !prev)}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-gray-200 transition hover:bg-white/10 hover:text-white"
              >
                Account ▾
              </button>

              {showAccountDropdown && (
                <div className="absolute right-0 mt-2 w-52 overflow-hidden rounded-2xl border border-white/10 bg-[#11151c] shadow-2xl">
                  <Link
                    href="/profile"
                    onClick={() => setShowAccountDropdown(false)}
                    className="block px-4 py-3 text-sm text-gray-300 transition hover:bg-white/5 hover:text-white"
                  >
                    Profile
                  </Link>
                  <Link
                    href="/alpaca"
                    className="block rounded-2xl px-4 py-3 text-sm text-gray-300 transition-colors hover:bg-[#1a1f2e] hover:text-white"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    Alpaca
                  </Link>

                  <Link
                    href="/user-guide"
                    onClick={() => setShowAccountDropdown(false)}
                    className="block px-4 py-3 text-sm text-gray-300 transition hover:bg-white/5 hover:text-white"
                  >
                    User Guide
                  </Link>

                  <button
                    type="button"
                    onClick={handleLogout}
                    className="block w-full px-4 py-3 text-left text-sm text-red-300 transition hover:bg-red-500/10 hover:text-red-200"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="lg:hidden">
            <div className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
              Paper
            </div>
          </div>
        </div>
      </header>

      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-[80] lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/70"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-label="Close menu"
          />

          <aside className="absolute left-0 top-0 flex h-full w-80 max-w-[88vw] flex-col border-r border-white/10 bg-[#0F1117]">
            <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
              <LuckmiLogo showText size={36} />

              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(false)}
                className="rounded-xl p-2 text-gray-400 transition hover:bg-white/5 hover:text-white"
                aria-label="Close menu"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <div className="mb-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-300">
                ● Paper Trading Active
              </div>

              <nav className="space-y-1">
                {navItems.map((item) => (
                  <Link
                    key={item.key}
                    href={item.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={mobileNavClass(item.key)}
                  >
                    {item.label}
                  </Link>
                ))}

                {isAdmin && (
                  <>
                    <Link
                      href="/admin/reports"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={`block rounded-2xl px-4 py-3 text-base font-medium transition ${
                        activePage === "admin-reports"
                          ? "bg-amber-500/10 text-amber-300"
                          : "text-amber-300 hover:bg-white/5 hover:text-amber-200"
                      }`}
                    >
                      Admin Reports
                    </Link>
                    <Link
                      href="/admin/users"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={`block rounded-2xl px-4 py-3 text-base font-medium transition ${
                        activePage === "admin-users"
                          ? "bg-amber-500/10 text-amber-300"
                          : "text-amber-300 hover:bg-white/5 hover:text-amber-200"
                      }`}
                    >
                      Admin Users
                    </Link>
                  </>
                )}

                <div className="my-3 border-t border-white/5" />

                <Link
                  href="/profile"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={mobileNavClass("profile")}
                >
                  Account
                </Link>
                <Link
                  href="/notifications"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={mobileNavClass('notifications')}
                >
                  Notifications {unreadCount > 0 ? `(${unreadCount > 99 ? '99+' : unreadCount})` : ''}
                </Link>
                <Link
                  href="/alpaca"
                  className="block rounded-2xl px-4 py-3 text-sm text-gray-300 transition-colors hover:bg-[#1a1f2e] hover:text-white"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  Alpaca
                </Link>
                <Link
                  href="/user-guide"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={mobileNavClass("user-guide")}
                >
                  User Guide
                </Link>
              </nav>
            </div>

            <div className="border-t border-white/5 p-4">
              <button
                type="button"
                onClick={handleLogout}
                className="w-full rounded-2xl bg-red-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-700"
              >
                Logout
              </button>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}