"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, MapPin, Video, CalendarDays, RefreshCw, Link2 } from "lucide-react";
import { Button, EmptyState, Pill, Skeleton, rise } from "@/components/ui/kit";
import { AGENT_NAME } from "@/lib/agent-name";

interface CalEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string | null;
  meetLink: string | null;
}

interface DayBucket {
  date: string;
  weekday: string;
  dayOfMonth: number;
  isToday: boolean;
  events: CalEvent[];
}

function startOfWeek(d: Date): string {
  const m = new Date(d);
  m.setDate(m.getDate() - m.getDay()); // weeks start on Sunday
  return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}-${String(m.getDate()).padStart(2, "0")}`;
}

function shiftWeek(start: string, days: number): string {
  const d = new Date(`${start}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function CalendarPage() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [label, setLabel] = useState("");
  const [days, setDays] = useState<DayBucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [apiNotEnabled, setApiNotEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const fetchWeek = useCallback(async (start: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/calendar/week?start=${start}`);
      const data = await res.json();
      if (!res.ok) {
        setNeedsReconnect(Boolean(data.needsReconnect));
        setApiNotEnabled(data.reason === "accessNotConfigured" || data.reason === "apiDisabled" || data.reason === "disabled");
        setError(data.error || "Failed to load calendar");
        setDays([]);
      } else {
        setNeedsReconnect(false);
        setApiNotEnabled(false);
        setLabel(data.label);
        setDays(data.days);
      }
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWeek(weekStart);
    const p = new URLSearchParams(window.location.search).get("google");
    if (p === "connected") setNotice("Google connected ✓");
    else if (p) setNotice(`Google connect failed: ${p}`);
  }, [weekStart, fetchWeek]);

  function fmtTime(iso: string) {
    return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }

  return (
    <div className="relative z-10 w-full mx-auto pt-4 pb-16">
      {/* Header */}
      <div className="hq-rise flex flex-wrap justify-between items-end gap-4 mb-6" style={rise(0)}>
        <div>
          <div className="eyebrow mb-2">Time &amp; Focus</div>
          <h1 className="text-[32px] font-semibold tracking-[-0.025em] leading-none text-[var(--text)]">Calendar</h1>
          <p className="num text-[12px] text-[var(--text-3)] mt-2">{label}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setWeekStart(shiftWeek(weekStart, -7))} title="Previous week">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setWeekStart(startOfWeek(new Date()))}>Today</Button>
          <Button variant="ghost" size="sm" onClick={() => setWeekStart(shiftWeek(weekStart, 7))} title="Next week">
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => fetchWeek(weekStart)} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      {(notice || label) && !loading && (
        <div className="hq-rise num text-[12px] text-[var(--text-3)] mb-4">{[notice, label].filter(Boolean).join("  ·  ")}</div>
      )}

      {apiNotEnabled && (
        <div className="hq-rise panel p-5 mb-5 text-[13px] text-[var(--text-2)] leading-relaxed" style={rise(1)}>
          <strong>One more switch:</strong> enable the <span className="num">Google Calendar API</span> in your
          Cloud project (APIs &amp; Services → Library → Google Calendar API → Enable), then hit Refresh.
        </div>
      )}

      {needsReconnect && !apiNotEnabled && (
        <div className="hq-rise panel p-5 mb-5 flex flex-wrap items-center gap-4" style={rise(1)}>
          <CalendarDays className="w-6 h-6 text-[var(--text-3)] shrink-0" />
          <p className="text-[13px] text-[var(--text-2)] leading-relaxed flex-1 min-w-[240px]">
            Calendar access needs one extra permission. Reconnect your Google account
            (the same one Gmail uses) and approve the calendar checkbox.
          </p>
          <a href="/api/email-triage/google/connect?returnTo=/calendar">
            <Button variant="primary"><Link2 className="w-3.5 h-3.5" /> Reconnect Google</Button>
          </a>
        </div>
      )}

      {!needsReconnect && error && (
        <div className="panel p-5 mb-5 text-[13px]" style={{ color: "var(--down)" }}>{error}</div>
      )}

      {/* Week grid */}
      {loading && days.length === 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
          {[...Array(7)].map((_, i) => (
            <div key={i} className="panel p-4"><Skeleton className="h-3 w-10 mb-3" /><Skeleton className="h-16 w-full" /></div>
          ))}
        </div>
      ) : days.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3 items-start">
          {days.map((day, i) => (
            <div
              key={day.date}
              className={`hq-rise panel p-3 min-h-[140px] ${day.isToday ? "!border-[var(--accent)] shadow-[0_0_0_1px_var(--accent)]" : ""}`}
              style={rise(i + 1)}
            >
              <div className="flex items-baseline justify-between mb-2.5 px-1">
                <span className={`text-[11px] font-semibold uppercase tracking-wide ${day.isToday ? "text-[var(--accent)]" : "text-[var(--text-3)]"}`}>
                  {day.weekday}
                </span>
                <span className={`num text-[15px] font-medium ${day.isToday ? "text-[var(--accent)]" : "text-[var(--text-2)]"}`}>
                  {day.dayOfMonth}
                </span>
              </div>

              <div className="space-y-2">
                {day.events.length === 0 ? (
                  <div className="text-[11px] num text-[var(--text-4)] px-1 pt-1">—</div>
                ) : (
                  day.events.map((e) => (
                    e.allDay ? (
                      <div key={e.id} className="rounded-lg px-2.5 py-1.5 bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)]">
                        <p className="text-[12px] font-medium text-[var(--text)] leading-snug">{e.title}</p>
                        <p className="text-[10px] num text-[var(--text-3)] mt-0.5">all-day</p>
                      </div>
                    ) : (
                      <div key={e.id} className="rounded-lg px-2.5 py-1.5 bg-[var(--surface-2)] border border-[var(--line)] hover:border-[var(--line-strong)] transition-colors">
                        <p className="text-[12px] font-medium text-[var(--text)] leading-snug">{e.title}</p>
                        <p className="text-[10.5px] num text-[var(--text-3)] mt-0.5">
                          {fmtTime(e.start)} – {fmtTime(e.end)}
                        </p>
                        {(e.location || e.meetLink) && (
                          <div className="flex items-center gap-2 mt-1">
                            {e.meetLink && (
                              <a href={e.meetLink} target="_blank" rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[10.5px] transition-opacity hover:opacity-70"
                                style={{ color: "var(--accent)" }}>
                                <Video className="w-3 h-3" /> join
                              </a>
                            )}
                            {e.location && (
                              <span className="inline-flex items-center gap-1 text-[10.5px] text-[var(--text-3)] truncate max-w-[130px]">
                                <MapPin className="w-3 h-3 shrink-0" /> <span className="truncate">{e.location}</span>
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      ) : !error ? (
        <EmptyState icon={<CalendarDays className="w-8 h-8" />} title="Nothing scheduled this week" />
      ) : null}

      <div className="mt-8 text-center">
        <Pill tone="neutral">
          Read-only · powered by the same Google connection as{" "}
          <Link href="/email-triage" className="underline underline-offset-2">Email Triage</Link> · ask {AGENT_NAME} to add write access anytime
        </Pill>
      </div>
    </div>
  );
}
