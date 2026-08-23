"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Inbox,
  Flag,
  BarChart3,
  Users,
  ArrowUpRight,
  ChevronRight,
  Mail,
  Phone,
  CalendarDays,
} from "lucide-react";
import { AGENT_NAME } from "@/lib/agent-name";
import { MetricCard } from "@/components/ui/metric-card";
import { HermesBriefing } from "@/components/hermes-briefing";
import { ApprovalInbox } from "@/components/approval-inbox";

// ── Types ─────────────────────────────────────────────────
interface TriageEmail { id: string; subject: string; senderName?: string | null; priority: string; receivedAt: string }
interface FollowUp { id: string; summary: string; person: string; org?: string | null; dueDate: string | null }
interface KpiHighlight { id: string; name: string; unit: string; category: string; latest: number; target: number | null; onTrack: boolean }
interface Touch { id: string; summary: string; channel: string; person: string; org?: string | null; date: string }
interface KanbanTask { id: string; title: string; status: string; assignee?: string | null }

interface HomeData {
  email: { triageCount: number; highPriorityOpen: number; overdueCount: number; topTriage: TriageEmail[] };
  followUps: FollowUp[];
  kpis: { tracked: number; onTrack: number; offTrack: number; highlights: KpiHighlight[] };
  stakeholders: { needsContact: number; total: number; recentTouches: Touch[] };
  hermesKanban: { total: number; counts: Record<string, number>; tasks: KanbanTask[] };
  openTasks: number;
}

const EMPTY: HomeData = {
  email: { triageCount: 0, highPriorityOpen: 0, overdueCount: 0, topTriage: [] },
  followUps: [],
  kpis: { tracked: 0, onTrack: 0, offTrack: 0, highlights: [] },
  stakeholders: { needsContact: 0, total: 0, recentTouches: [] },
  hermesKanban: { total: 0, counts: {}, tasks: [] },
  openTasks: 0,
};

function fmt(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return Math.round(n / 1_000) + "K";
  return n.toString();
}
function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const days = Math.floor(diff / 86400000);
  const hrs = Math.floor(diff / 3600000);
  if (days > 7) return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (days > 0) return `${days}d ago`;
  if (hrs > 0) return `${hrs}h ago`;
  return "just now";
}
function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Still up";
}

// ── Section header ────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <span className="eyebrow">{children}</span>
      <span className="h-px flex-1 bg-[var(--hq-hairline)]" />
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[var(--hq-text-ghost)] text-[13px] py-8 text-center">{children}</p>;
}

// ── Email triage preview ─────────────────────────────────
function TriagePreview({ emails }: { emails: TriageEmail[] }) {
  return (
    <div className="panel flex flex-col p-6 h-full">
      <div className="flex items-center gap-2 mb-4">
        <Inbox className="w-3.5 h-3.5" style={{ color: "#38bdf8" }} />
        <span className="eyebrow">Needs Triage</span>
      </div>
      {emails.length === 0 ? (
        <Empty>Inbox clear. Nothing needs triage.</Empty>
      ) : (
        <div>
          {emails.map((e) => (
            <Link key={e.id} href="/email-triage" className="group flex gap-3 py-2.5 border-b border-[var(--hq-hairline)] last:border-0 items-start">
              <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${e.priority === "high" ? "" : ""}`} style={{ background: e.priority === "high" ? "var(--hq-down)" : e.priority === "low" ? "var(--hq-text-faint)" : "var(--hq-warn)" }} />
              <div className="flex-1 min-w-0">
                <p className="text-[var(--hq-text-dim)] text-[13px] leading-snug line-clamp-1 group-hover:text-[var(--hq-text)] transition-colors">{e.subject}</p>
                <p className="text-[11px] text-[var(--hq-text-ghost)] num">{e.senderName || "Unknown"} · {timeAgo(e.receivedAt)}</p>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-[var(--hq-text-ghost)] group-hover:text-[var(--hq-text-dim)] shrink-0 mt-0.5 transition-all group-hover:translate-x-0.5" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Stakeholder touches + follow-ups ─────────────────────
function RelationshipsPanel({ followUps, touches }: { followUps: FollowUp[]; touches: Touch[] }) {
  const channelIcon = (c: string) =>
    c === "call" ? <Phone className="w-3 h-3" /> : c === "meeting" || c === "event" ? <CalendarDays className="w-3 h-3" /> : <Mail className="w-3 h-3" />;

  return (
    <div className="panel flex flex-col p-6 h-full">
      <div className="flex items-center justify-between mb-4">
        <span className="eyebrow">Relationships</span>
        <Link href="/stakeholders" className="text-[11px] text-[var(--hq-text-faint)] hover:text-[var(--hq-text-dim)] transition-colors">View all</Link>
      </div>

      {followUps.length > 0 && (
        <div className="mb-4">
          <div className="eyebrow !text-[9.5px] mb-2">Follow-ups due</div>
          <div className="space-y-1.5">
            {followUps.map((f) => (
              <Link key={f.id} href="/stakeholders" className="group flex items-center gap-2.5 rounded-lg border px-2.5 py-2"
                style={{ borderColor: "color-mix(in srgb, var(--hq-warn) 22%, transparent)", background: "color-mix(in srgb, var(--hq-warn) 6%, transparent)" }}>
                <Flag className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--hq-warn)" }} />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] text-[var(--hq-text-dim)] truncate group-hover:text-[var(--hq-text)]">{f.summary}</p>
                  <p className="num text-[10.5px] text-[var(--hq-text-ghost)]">{f.person}{f.org ? ` · ${f.org}` : ""}{f.dueDate ? ` · due ${new Date(f.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="eyebrow !text-[9.5px] mb-2">Recent touchpoints</div>
      {touches.length === 0 ? <Empty>No interactions logged yet.</Empty> : (
        <div>
          {touches.slice(0, 4).map((t) => (
            <div key={t.id} className="flex items-center gap-2.5 py-2 border-b border-[var(--hq-hairline)] last:border-0">
              <span className="text-[var(--hq-text-faint)] shrink-0">{channelIcon(t.channel)}</span>
              <p className="text-[12.5px] text-[var(--hq-text-dim)] truncate flex-1"><span className="font-medium text-[var(--hq-text-dim)]">{t.person}</span> — {t.summary}</p>
              <span className="num text-[10.5px] text-[var(--hq-text-ghost)] shrink-0">{timeAgo(t.date)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── KPI highlights ───────────────────────────────────────
function KpiHighlightsPanel({ kpis }: { kpis: HomeData["kpis"] }) {
  return (
    <div className="panel flex flex-col p-6 h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-3.5 h-3.5" style={{ color: "#34d399" }} />
          <span className="eyebrow">KPI Pulse</span>
        </div>
        <Link href="/kpis" className="text-[11px] text-[var(--hq-text-faint)] hover:text-[var(--hq-text-dim)] transition-colors">Open database</Link>
      </div>

      {kpis.highlights.length === 0 ? (
        <Empty>No KPIs with readings yet.</Empty>
      ) : (
        <div className="space-y-3 mb-2">
          {kpis.highlights.map((k) => (
            <Link key={k.id} href="/kpis" className="group block">
              <div className="flex items-baseline justify-between gap-2 mb-1.5">
                <p className="text-[12.5px] text-[var(--hq-text-dim)] group-hover:text-[var(--hq-text)] transition-colors truncate">{k.name}</p>
                <span className="num text-[13px] font-semibold shrink-0" style={{ color: k.onTrack ? "var(--hq-up)" : "var(--hq-warn)" }}>
                  {k.unit === "currency" ? "$" : ""}{fmt(k.latest)}{k.unit === "percent" ? "%" : ""}
                  {k.target != null && <span className="text-[10.5px] text-[var(--hq-text-ghost)] font-normal"> / {k.unit === "currency" ? "$" : ""}{fmt(k.target)}{k.unit === "percent" ? "%" : ""}</span>}
                </span>
              </div>
              <div className="h-[3px] rounded-full bg-white/[0.06] overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700" style={{
                  width: `${Math.min(100, k.target ? (k.unit === "percent" ? k.latest / k.target * 100 : (k.latest / k.target) * 100) : 100)}%`,
                  background: k.onTrack ? "var(--hq-up)" : "var(--hq-warn)",
                  opacity: 0.85,
                }} />
              </div>
            </Link>
          ))}
        </div>
      )}

      {kpis.tracked > 0 && (
        <div className="mt-auto pt-4 flex gap-2 text-[11px] num text-[var(--hq-text-ghost)]">
          <span style={{ color: "var(--hq-up)" }}>{kpis.onTrack} on track</span>
          <span>·</span>
          <span style={kpis.offTrack > 0 ? { color: "var(--hq-warn)" } : undefined}>{kpis.offTrack} need attention</span>
        </div>
      )}
    </div>
  );
}

// ── Hermes kanban ────────────────────────────────────────
function HermesKanbanPanel({ kanban }: { kanban: HomeData["hermesKanban"] }) {
  const statusColor = (s: string) => {
    const k = s.toLowerCase();
    if (k.includes("done") || k.includes("complete")) return "var(--hq-up)";
    if (k.includes("progress") || k.includes("doing")) return "var(--accent)";
    if (k.includes("block")) return "var(--hq-down)";
    return "var(--hq-text-faint)";
  };
  const entries = Object.entries(kanban.counts || {});
  return (
    <div className="panel flex flex-col p-6 h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="min-w-0">
          <span className="eyebrow">{AGENT_NAME} Board</span>
          <Link href="/hermes" className="text-[13px] text-[var(--hq-text-dim)] hover:text-[var(--hq-text)] truncate mt-1 inline-flex items-center gap-1 transition-colors">
            View hub <ArrowUpRight className="w-3 h-3" />
          </Link>
        </div>
        <span className="num text-[22px] font-semibold text-[var(--hq-text)] shrink-0">{kanban.total}</span>
      </div>

      {entries.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {entries.map(([status, count]) => (
            <span key={status} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium num"
              style={{ color: statusColor(status), background: `color-mix(in srgb, ${statusColor(status)} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${statusColor(status)} 22%, transparent)` }}>
              {status} {count}
            </span>
          ))}
        </div>
      )}

      {kanban.tasks.length === 0 ? <Empty>No agent tasks mirrored yet.</Empty> : (
        <div>
          {kanban.tasks.map((t) => (
            <div key={t.id} className="flex items-center gap-3 py-2.5 border-b border-[var(--hq-hairline)] last:border-0">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: statusColor(t.status) }} />
              <p className="text-[13px] text-[var(--hq-text-dim)] leading-snug line-clamp-1 flex-1">{t.title}</p>
              {t.assignee && <span className="num text-[10.5px] text-[var(--hq-text-ghost)] shrink-0">{t.assignee}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────
export default function Dashboard() {
  const [data, setData] = useState<HomeData>(EMPTY);
  const [time, setTime] = useState(new Date());
  const [loaded, setLoaded] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // defer past paint so hydration never mismatches
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    fetch("/api/home")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) { setData(d); setTimeout(() => setLoaded(true), 100); } })
      .catch(() => {});
    const iv = setInterval(() => {
      fetch("/api/home").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) setData(d); }).catch(() => {});
    }, 60_000);
    return () => clearInterval(iv);
  }, []);

  if (!mounted) return null;

  const rise = (i: number) => ({ animationDelay: `${i * 60}ms` });

  return (
    <>
      <div className="relative z-10 w-full mx-auto pb-16">

        {/* ── Header ─────────────────────────────────────── */}
        <div className="hq-rise pt-4 pb-10 flex flex-wrap items-end justify-between gap-6" style={rise(0)}>
          <div>
            <div className="eyebrow mb-2.5">{greeting()}</div>
            <h1 className="text-[40px] font-semibold tracking-[-0.025em] leading-none text-[var(--hq-text)]">
              {process.env.NEXT_PUBLIC_OWNER_NAME || "Director"}
            </h1>
            <p className="num text-[var(--hq-text-ghost)] text-[12.5px] mt-3">
              {time.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              {"  ·  "}
              {time.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1.5 rounded-full border border-[var(--hq-hairline)] bg-white/[0.02] px-2.5 py-1">
              <span className="relative flex w-1.5 h-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full animate-ping" style={{ background: "color-mix(in srgb, var(--up) 60%, transparent)" }} />
                <span className="relative inline-flex w-1.5 h-1.5 rounded-full" style={{ background: "var(--up)" }} />
              </span>
              <span className="eyebrow !text-[9.5px] !text-[var(--hq-text-faint)]">Live</span>
            </div>
          </div>
        </div>

        {/* ── Stat cards ─────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
          <MetricCard
            label="Emails to Triage" value={data.email.triageCount}
            sub={`${data.email.highPriorityOpen} high priority · ${data.email.overdueCount} overdue`}
            icon={<Inbox className="w-4 h-4" />} accent="#38bdf8" href="/email-triage" loaded={loaded}
          />
          <MetricCard
            label="Open Tasks" value={data.openTasks}
            sub="across your board"
            icon={<Flag className="w-4 h-4" />} accent="#a78bfa" href="/tasks" loaded={loaded}
          />
          <MetricCard
            label="KPIs Off Track" value={data.kpis.offTrack}
            sub={`${data.kpis.onTrack}/${data.kpis.tracked} on track`}
            icon={<BarChart3 className="w-4 h-4" />} accent="#34d399" href="/kpis" loaded={loaded}
          />
          <MetricCard
            label="Due for Contact" value={data.stakeholders.needsContact}
            sub={`${data.stakeholders.total} tracked relationships`}
            icon={<Users className="w-4 h-4" />} accent="#fbbf24" href="/stakeholders" loaded={loaded}
          />
        </div>

        {/* ── Brief + Approval inbox (side-by-side on wide) ─ */}
        <div className="mt-5 grid grid-cols-1 xl:grid-cols-3 gap-5 items-start">
          <div className="xl:col-span-2 hq-rise" style={rise(5)}>
            <HermesBriefing />
          </div>
          <div className="xl:col-span-1 hq-rise" style={rise(6)}>
            <ApprovalInbox compact />
          </div>
        </div>

        {/* ── Signal ──────────────────────────────────────── */}
        <div className="mt-14">
          <SectionLabel>Today&apos;s Signal</SectionLabel>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="hq-rise lg:col-span-1" style={rise(4)}><TriagePreview emails={data.email.topTriage} /></div>
            <div className="hq-rise lg:col-span-1" style={rise(5)}><RelationshipsPanel followUps={data.followUps} touches={data.stakeholders.recentTouches} /></div>
            <div className="hq-rise lg:col-span-1" style={rise(6)}><KpiHighlightsPanel kpis={data.kpis} /></div>
          </div>
        </div>

        {/* ── Hermes board ───────────────────────────────── */}
        <div className="mt-14 grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="hq-rise" style={rise(7)}><HermesKanbanPanel kanban={data.hermesKanban} /></div>
        </div>
      </div>
    </>
  );
}
