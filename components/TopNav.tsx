'use client';

import { useEffect, useRef, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

type TopNavProps = {
  /** The nav link that should be highlighted as active */
  activePage?: 'stocks' | 'admin' | 'profile' | 'alpaca';
};

export default function TopNav({ activePage }: TopNavProps) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);
  const [showMobileAccountDropdown, setShowMobileAccountDropdown] = useState(false);
  const accountDropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (accountDropdownRef.current && !accountDropdownRef.current.contains(e.target as Node)) {
        setShowAccountDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const fetchAdminStatus = async () => {
      try {
        const res = await fetch('/api/admin/me');
        if (!res.ok) return;
        const data = await res.json();
        setIsAdmin(!!data?.isAdmin);
      } catch {
        // not admin or not logged in
      }
    };
    fetchAdminStatus();
  }, []);

  const handleLogout = async () => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const linkClass = (page: string) =>
    `hover:text-blue-400 transition-colors ${activePage === page ? 'text-blue-400' : ''}`;

  return (
    <>
      {/* Top Navigation Bar */}
      <div className="bg-[#11151c] border-b border-gray-800 px-4 py-3 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          {/* Burger Menu - Mobile Only */}
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="lg:hidden p-2 text-gray-400 hover:text-white"
          >
            <span className="text-2xl">☰</span>
          </button>

          <div>
            <h1 className="font-semibold text-2xl tracking-tight">Luckmi AI</h1>
            <p className="text-xs text-emerald-400 font-medium tracking-widest">
              TRADING &amp; INVESTMENTS
            </p>
          </div>
        </div>

        {/* Desktop Navigation */}
        <div className="hidden lg:flex items-center gap-8 text-sm font-medium">
          <a href="/stock" className={linkClass('stocks')}>Stocks</a>
            
          {isAdmin && (
            <a href="/admin/users" className={`hover:text-amber-400 transition-colors ${activePage === 'admin' ? 'text-amber-400' : ''}`}>
              Admin
            </a>
          )}

          {/* Account Dropdown */}
          <div className="relative" ref={accountDropdownRef}>
            <button
              onClick={() => setShowAccountDropdown(prev => !prev)}
              className="hover:text-blue-400 transition-colors flex items-center gap-1"
            >
              Account <span className="text-xs">▾</span>
            </button>
            {showAccountDropdown && (
              <div className="absolute right-0 mt-2 w-44 bg-[#1a1f2e] border border-gray-700 rounded-xl shadow-lg overflow-hidden z-50">
                <a
                  href="/profile"
                  className="block px-4 py-3 text-sm hover:bg-[#252b3b] transition-colors"
                  onClick={() => setShowAccountDropdown(false)}
                >
                  Profile
                </a>
                <button
                  className="w-full text-left px-4 py-3 text-sm hover:bg-[#252b3b] transition-colors"
                  onClick={() => { setShowAccountDropdown(false); window.location.href = '/alpaca'; }}
                >
                  Alpaca
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 rounded-xl transition-colors"
        >
          Logout
        </button>
      </div>

      {/* Mobile Slide-in Menu */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setIsMobileMenuOpen(false)}
          />

          {/* Drawer */}
          <div className="absolute left-0 top-0 h-full w-72 bg-[#11151c] border-r border-gray-800 flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
              <div>
                <h1 className="font-semibold text-xl">Luckmi AI</h1>
                <p className="text-xs text-emerald-400 font-medium tracking-widest">
                  TRADING &amp; INVESTMENTS
                </p>
              </div>
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="text-gray-400 hover:text-white text-2xl"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4">
              <div className="space-y-1 text-lg">
                <a href="/stock" className="block py-4 px-5 hover:bg-[#1a1f2e] rounded-2xl hover:text-blue-400 transition-colors">
                  Stocks
                </a>

                {isAdmin && (
                  <a href="/admin/users" className="block py-4 px-5 hover:bg-[#1a1f2e] rounded-2xl text-amber-400 hover:text-amber-300 transition-colors">
                    Admin
                  </a>
                )}

                {/* Account submenu */}
                <div>
                  <button
                    onClick={() => setShowMobileAccountDropdown(prev => !prev)}
                    className="w-full text-left flex items-center justify-between py-4 px-5 hover:bg-[#1a1f2e] rounded-2xl hover:text-blue-400 transition-colors"
                  >
                    Account <span className="text-sm">{showMobileAccountDropdown ? '▴' : '▾'}</span>
                  </button>
                  {showMobileAccountDropdown && (
                    <div className="ml-4 space-y-1">
                      <a
                        href="/profile"
                        className="block py-3 px-5 text-sm text-gray-300 hover:bg-[#1a1f2e] rounded-2xl hover:text-blue-400 transition-colors"
                        onClick={() => { setIsMobileMenuOpen(false); window.location.href = '/profile'; }}
                      >
                        Profile
                      </a>
                      <button
                        className="w-full text-left py-3 px-5 text-sm text-gray-300 hover:bg-[#1a1f2e] rounded-2xl hover:text-blue-400 transition-colors"
                        onClick={() => { setIsMobileMenuOpen(false); window.location.href = '/alpaca'; }}
                      >
                        Alpaca
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Logout */}
            <div className="pt-6 mt-6 border-t border-gray-700 px-5 pb-6">
              <button
                onClick={handleLogout}
                className="w-full py-3 bg-red-600 hover:bg-red-700 text-white rounded-2xl text-sm font-medium transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
