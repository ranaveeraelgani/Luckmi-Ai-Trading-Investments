"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import TopNav from "@/components/TopNav";

type GuideSection = {
  id: string;
  title: string;
  href: string;
  summary: string;
  steps: string[];
  adminOnly?: boolean;
};

const sections: GuideSection[] = [
  {
    id: "dashboard",
    title: "Dashboard",
    href: "/dashboard",
    summary:
      "Use Dashboard first to check account health, recent activity, and where to focus next.",
    steps: [
      "Check portfolio snapshot and top movers.",
      "Review alerts first, then open the page linked by each alert.",
      "Decide your next action for the day before opening other modules.",
    ],
  },
  {
    id: "watchlist",
    title: "Watchlist",
    href: "/watchlist",
    summary:
      "Track candidate symbols before capital is committed. Keep this list clean and intentional.",
    steps: [
      "Keep only high-conviction symbols you may trade soon.",
      "Open symbol detail to review AI analysis and setup quality.",
      "Move qualified ideas to Portfolio or Auto Trading.",
    ],
  },
  {
    id: "portfolio",
    title: "Portfolio",
    href: "/portfolio",
    summary:
      "Monitor open positions, unrealized P&L, and symbol-level conviction after entry.",
    steps: [
      "Check exposure and concentration by symbol.",
      "Review each holding's trend and risk before adding size.",
      "Trim risk when one symbol dominates total allocation.",
    ],
  },
  {
    id: "auto-trading",
    title: "Auto Trading",
    href: "/auto",
    summary:
      "Run the engine, inspect reasons behind Buy/Hold/Sell decisions, and manage automation safely.",
    steps: [
      "Add symbols with clear allocation limits.",
      "Run manual cycle and review decision reasons and confidence.",
      "Use Next run countdown and broker sync status before rerunning.",
    ],
  },
  {
    id: "picks",
    title: "Luckmi Picks",
    href: "/picks",
    summary:
      "Use Picks for idea generation, then validate in Watchlist or Portfolio before acting.",
    steps: [
      "Scan top ideas and shortlist 2-5 symbols.",
      "Validate shortlisted symbols with trend and risk context.",
      "Promote only validated symbols to your active workflow.",
    ],
  },
  {
    id: "reports",
    title: "Reports",
    href: "/reports",
    summary:
      "Use reports to measure behavior quality over time and improve one thing per cycle.",
    steps: [
      "Start with Overview pulse metrics.",
      "Open Risk and Coach tabs for context and concrete recommendations.",
      "Pick one adjustment and review impact in the next 7d or 30d window.",
    ],
  },
  {
    id: "admin-reports",
    title: "Admin Reports",
    href: "/admin/reports",
    summary:
      "Platform-level diagnostics for admins only, including risk concentration and execution reliability.",
    steps: [
      "Use Executive tab for overall platform health.",
      "Check Risk and Execution tabs for operational issues.",
      "Take one platform action and recheck in the next cycle.",
    ],
    adminOnly: true,
  },
];

function SectionCard({
  section,
  isOpen,
  onToggle,
}: {
  section: GuideSection;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <section
      id={section.id}
      className="rounded-3xl border border-white/10 bg-[#11151c] p-6 sm:p-7"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <button
            type="button"
            onClick={onToggle}
            className="rounded-xl border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-gray-200 transition hover:bg-white/10"
            aria-expanded={isOpen}
            aria-controls={`guide-panel-${section.id}`}
          >
            {isOpen ? "Hide" : "Show"}
          </button>
          <h2 className="text-xl font-semibold text-white sm:text-2xl">{section.title}</h2>
        </div>
        <Link
          href={section.href}
          className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-sm font-medium text-emerald-300 transition hover:bg-emerald-500/20"
        >
          Open {section.title}
        </Link>
      </div>

      <p className="mt-3 text-sm text-gray-300 sm:text-base">{section.summary}</p>

      {isOpen ? (
        <div id={`guide-panel-${section.id}`} className="mt-4 grid gap-3 sm:grid-cols-3">
          {section.steps.map((step, index) => (
            <div key={step} className="rounded-2xl border border-white/10 bg-[#141926] p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-cyan-300">
                Step {index + 1}
              </p>
              <p className="mt-1 text-sm text-gray-200">{step}</p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export default function UserGuidePage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [expandedSectionIds, setExpandedSectionIds] = useState<string[]>(["dashboard"]);

  useEffect(() => {
    async function fetchAdminStatus() {
      try {
        const res = await fetch("/api/admin/me", { cache: "no-store" });
        if (!res.ok) {
          setIsAdmin(false);
          return;
        }

        const data = await res.json();
        setIsAdmin(Boolean(data?.isAdmin));
      } catch {
        setIsAdmin(false);
      }
    }

    fetchAdminStatus();
  }, []);

  const visibleSections = sections.filter((section) => !section.adminOnly || isAdmin);

  const toggleSection = (sectionId: string) => {
    setExpandedSectionIds((prev) =>
      prev.includes(sectionId)
        ? prev.filter((id) => id !== sectionId)
        : [...prev, sectionId]
    );
  };

  return (
    <div className="min-h-screen bg-[#0b0f16] text-white">
      <TopNav activePage="user-guide" />

      <main className="mx-auto max-w-6xl p-4 sm:p-6">
        <section className="rounded-3xl border border-white/10 bg-[#11151c] p-6 sm:p-8">
          <p className="inline-flex items-center rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-300">
            User Guide
          </p>
          <h1 className="mt-4 text-3xl font-semibold leading-tight sm:text-4xl">
            Navigate Luckmi Without Feeling Overwhelmed
          </h1>
          <p className="mt-3 max-w-3xl text-sm text-gray-300 sm:text-base">
            Follow one simple path: Dashboard to Watchlist to Portfolio or Auto Trading, then review outcomes in Reports.
            Use Picks when you need fresh ideas.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-[#141926] p-4">
              <p className="text-xs uppercase tracking-wide text-cyan-300">Start Here</p>
              <p className="mt-1 text-sm text-gray-200">Open Dashboard and check alerts and account pulse.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-[#141926] p-4">
              <p className="text-xs uppercase tracking-wide text-cyan-300">Work Flow</p>
              <p className="mt-1 text-sm text-gray-200">Research in Watchlist, manage risk in Portfolio or Auto Trading.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-[#141926] p-4">
              <p className="text-xs uppercase tracking-wide text-cyan-300">Improve Loop</p>
              <p className="mt-1 text-sm text-gray-200">Use Reports weekly and change one behavior at a time.</p>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-3xl border border-white/10 bg-[#11151c] p-5 sm:p-6">
          <p className="text-xs uppercase tracking-wide text-gray-400">Quick Navigation</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {visibleSections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-gray-200 transition hover:bg-white/10"
              >
                {section.title}
              </a>
            ))}
          </div>
        </section>

        <div className="mt-6 space-y-5">
          {visibleSections.map((section) => (
            <SectionCard
              key={section.id}
              section={section}
              isOpen={expandedSectionIds.includes(section.id)}
              onToggle={() => toggleSection(section.id)}
            />
          ))}
        </div>

        <section className="mt-6 mb-10 rounded-3xl border border-amber-400/20 bg-amber-400/10 p-6 text-sm text-amber-100">
          Recommended rhythm: check Dashboard daily, update Watchlist and Portfolio during market hours,
          run Auto Trading intentionally, then review Reports every week.
        </section>
      </main>
    </div>
  );
}
