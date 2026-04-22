"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type AdminUserRow = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  is_admin: boolean;
  created_at: string;
  plan: string;
  stock_count: number;
  last_engine_run: {
    status: string;
    created_at: string;
  } | null;
};

type SortKey = "name" | "email" | "plan" | "stocks" | "engine" | "created_at";
type SortDirection = "asc" | "desc";

const PAGE_SIZE = 10;

function formatDate(value?: string | null) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return "—";
  }
}

function engineTone(status?: string | null) {
  if (status === "success") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  }
  if (status === "failed") {
    return "border-red-500/30 bg-red-500/10 text-red-300";
  }
  if (status === "blocked") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  }
  return "border-gray-700 bg-[#161b22] text-gray-300";
}

function planTone(plan?: string | null) {
  const normalized = (plan || "").toLowerCase();

  if (normalized === "pro") {
    return "border-blue-500/30 bg-blue-500/10 text-blue-300";
  }

  if (normalized === "free") {
    return "border-gray-700 bg-[#161b22] text-gray-300";
  }

  return "border-violet-500/30 bg-violet-500/10 text-violet-300";
}

function Pill({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${className}`}>
      {children}
    </span>
  );
}

function HeaderButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left transition ${
        active ? "text-white" : "text-gray-400 hover:text-gray-200"
      }`}
    >
      {children}
    </button>
  );
}

export function AdminUsersTable({ users }: { users: AdminUserRow[] }) {
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("all");
  const [engineFilter, setEngineFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);

  const plans = useMemo(() => {
    return Array.from(new Set(users.map((u) => u.plan).filter(Boolean))).sort();
  }, [users]);

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();

    return users.filter((user) => {
      const matchesSearch =
        !term ||
        (user.full_name || "").toLowerCase().includes(term) ||
        (user.email || "").toLowerCase().includes(term);

      const matchesPlan = planFilter === "all" || user.plan === planFilter;

      const engineStatus = user.last_engine_run?.status || "never";
      const matchesEngine = engineFilter === "all" || engineStatus === engineFilter;

      return matchesSearch && matchesPlan && matchesEngine;
    });
  }, [users, search, planFilter, engineFilter]);

  const sortedUsers = useMemo(() => {
    const copy = [...filteredUsers];

    copy.sort((a, b) => {
      let aValue: string | number = "";
      let bValue: string | number = "";

      switch (sortKey) {
        case "name":
          aValue = (a.full_name || "").toLowerCase();
          bValue = (b.full_name || "").toLowerCase();
          break;
        case "email":
          aValue = (a.email || "").toLowerCase();
          bValue = (b.email || "").toLowerCase();
          break;
        case "plan":
          aValue = (a.plan || "").toLowerCase();
          bValue = (b.plan || "").toLowerCase();
          break;
        case "stocks":
          aValue = a.stock_count;
          bValue = b.stock_count;
          break;
        case "engine":
          aValue = (a.last_engine_run?.status || "never").toLowerCase();
          bValue = (b.last_engine_run?.status || "never").toLowerCase();
          break;
        case "created_at":
          aValue = new Date(a.created_at).getTime();
          bValue = new Date(b.created_at).getTime();
          break;
      }

      if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
      if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });

    return copy;
  }, [filteredUsers, sortKey, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(sortedUsers.length / PAGE_SIZE));

  const paginatedUsers = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return sortedUsers.slice(start, start + PAGE_SIZE);
  }, [sortedUsers, page]);

  function updateSort(nextKey: SortKey) {
    setPage(1);

    if (sortKey === nextKey) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextKey);
    setSortDirection(nextKey === "created_at" || nextKey === "stocks" ? "desc" : "asc");
  }

  function resetPage() {
    setPage(1);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-gray-800 bg-[#11151c] p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-1 flex-col gap-3 md:flex-row">
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                resetPage();
              }}
              placeholder="Search by name or email"
              className="w-full rounded-2xl border border-gray-700 bg-[#0f141b] px-4 py-2.5 text-sm text-white outline-none placeholder:text-gray-500 focus:border-blue-500"
            />

            <select
              value={planFilter}
              onChange={(e) => {
                setPlanFilter(e.target.value);
                resetPage();
              }}
              className="rounded-2xl border border-gray-700 bg-[#0f141b] px-4 py-2.5 text-sm text-white outline-none focus:border-blue-500"
            >
              <option value="all">All plans</option>
              {plans.map((plan) => (
                <option key={plan} value={plan}>
                  {plan}
                </option>
              ))}
            </select>

            <select
              value={engineFilter}
              onChange={(e) => {
                setEngineFilter(e.target.value);
                resetPage();
              }}
              className="rounded-2xl border border-gray-700 bg-[#0f141b] px-4 py-2.5 text-sm text-white outline-none focus:border-blue-500"
            >
              <option value="all">All engine states</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
              <option value="blocked">Blocked</option>
              <option value="never">Never</option>
            </select>
          </div>

          <div className="text-sm text-gray-400">
            Showing <span className="font-medium text-white">{paginatedUsers.length}</span> of{" "}
            <span className="font-medium text-white">{sortedUsers.length}</span>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-gray-800 bg-[#11151c]">
        <div className="grid grid-cols-12 gap-3 border-b border-gray-800 bg-[#0f141b] px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          <div className="col-span-12 md:col-span-3">
            <HeaderButton active={sortKey === "name"} onClick={() => updateSort("name")}>
              User
            </HeaderButton>
          </div>

          <div className="col-span-12 md:col-span-3">
            <HeaderButton active={sortKey === "email"} onClick={() => updateSort("email")}>
              Email
            </HeaderButton>
          </div>

          <div className="col-span-4 md:col-span-2">
            <HeaderButton active={sortKey === "plan"} onClick={() => updateSort("plan")}>
              Plan
            </HeaderButton>
          </div>

          <div className="col-span-4 md:col-span-1">
            <HeaderButton active={sortKey === "stocks"} onClick={() => updateSort("stocks")}>
              Stocks
            </HeaderButton>
          </div>

          <div className="col-span-4 md:col-span-2">
            <HeaderButton active={sortKey === "engine"} onClick={() => updateSort("engine")}>
              Engine
            </HeaderButton>
          </div>

          <div className="col-span-12 md:col-span-1 text-left md:text-right">
            Action
          </div>
        </div>

        {paginatedUsers.length === 0 ? (
          <div className="px-4 py-10 text-center text-gray-400">
            No users match the current filters.
          </div>
        ) : (
          <div className="divide-y divide-gray-800">
            {paginatedUsers.map((user) => {
              const engineStatus = user.last_engine_run?.status || "never";

              return (
                <div
                  key={user.user_id}
                  className="grid grid-cols-12 gap-3 px-4 py-4 transition hover:bg-white/[0.02]"
                >
                  <div className="col-span-12 md:col-span-3 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="truncate text-sm font-semibold text-white">
                        {user.full_name || "Unnamed User"}
                      </div>

                      {user.is_admin ? (
                        <Pill className="border-blue-500/30 bg-blue-500/10 text-blue-300">
                          Admin
                        </Pill>
                      ) : null}
                    </div>

                    <div className="mt-1 truncate text-xs text-gray-500">
                      Joined {formatDate(user.created_at)}
                    </div>
                  </div>

                  <div className="col-span-12 md:col-span-3 min-w-0">
                    <div className="truncate text-sm text-gray-300">{user.email || "—"}</div>
                    <div className="mt-1 truncate text-xs text-gray-500">{user.user_id}</div>
                  </div>

                  <div className="col-span-4 md:col-span-2 flex items-center">
                    <Pill className={planTone(user.plan)}>{user.plan}</Pill>
                  </div>

                  <div className="col-span-4 md:col-span-1 flex items-center">
                    <div className="text-sm font-semibold text-white">{user.stock_count}</div>
                  </div>

                  <div className="col-span-4 md:col-span-2 flex items-center">
                    <div>
                      <Pill className={engineTone(engineStatus)}>{engineStatus}</Pill>
                      <div className="mt-1 text-xs text-gray-500">
                        {formatDate(user.last_engine_run?.created_at)}
                      </div>
                    </div>
                  </div>

                  <div className="col-span-12 md:col-span-1 flex items-center md:justify-end">
                    <Link
                      href={`/admin/users/${user.user_id}`}
                      className="inline-flex items-center justify-center rounded-2xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
                    >
                      View
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-3xl border border-gray-800 bg-[#11151c] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-gray-400">
          Page <span className="font-medium text-white">{page}</span> of{" "}
          <span className="font-medium text-white">{totalPages}</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            disabled={page === 1}
            className="rounded-2xl border border-gray-700 bg-[#0f141b] px-4 py-2 text-sm text-white transition disabled:cursor-not-allowed disabled:opacity-40 hover:border-gray-500"
          >
            Previous
          </button>

          <button
            type="button"
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            disabled={page === totalPages}
            className="rounded-2xl border border-gray-700 bg-[#0f141b] px-4 py-2 text-sm text-white transition disabled:cursor-not-allowed disabled:opacity-40 hover:border-gray-500"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}