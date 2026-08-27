"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Check, FileText, Mail, Plus, School, Trash2, X } from "lucide-react";
import { Button, EmptyState, Pill, Skeleton, rise } from "@/components/ui/kit";

interface Metric {
  id: string;
  name: string;
  value: number;
  unit?: string | null;
  recordedAt: string;
  note?: string | null;
}

interface GoalReading {
  id: string;
  value: number;
  periodStart: string;
}

interface Goal {
  id: string;
  name: string;
  category: string;
  unit: string;
  target?: number | null;
  direction: string;
  frequency: string;
  readings: GoalReading[];
  sharedFromName?: string | null;
}

interface Interaction {
  id: string;
  channel: string;
  direction: string;
  summary: string;
  date: string;
}

interface Person {
  id: string;
  name: string;
  organization?: string | null;
  title?: string | null;
  type: string;
  email?: string | null;
  phone?: string | null;
  importance: string;
  notes?: string | null;
  oneOnOneDocUrl?: string | null;
  lastContactAt?: string | null;
  interactions: Interaction[];
  delegatedTasks: { id: string; name: string; status: string; priority: string; dueDate?: string | null; sourceEmail?: { gmailId?: string | null; subject?: string | null } | null }[];
  metrics: Metric[];
  goals: Goal[];
  school?: { id: string; name: string } | null;
  members?: { id: string; name: string }[];
}

export default function TeamPage() {
  const [coordinators, setCoordinators] = useState<Person[]>([]);
  const [schools, setSchools] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const fetchTeam = useCallback(async () => {
    try {
      const res = await fetch("/api/team");
      const data = await res.json();
      setCoordinators(data.coordinators || []);
      setSchools(data.schools || []);
    } catch {
      console.error("Failed to fetch team");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTeam();
  }, [fetchTeam]);

  const everyone = [...coordinators, ...schools];
  const selected = everyone.find((p) => p.id === selectedId) || null;

  return (
    <div className="relative z-10 w-full mx-auto pt-4 pb-16">
      <div className="hq-rise flex flex-wrap justify-between items-end gap-4 mb-8" style={rise(0)}>
        <div>
          {selected ? (
            <button
              onClick={() => setSelectedId(null)}
              className="flex items-center gap-1.5 text-[12px] text-[var(--text-3)] hover:text-[var(--text)] transition-colors mb-2"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> My Team
            </button>
          ) : (
            <div className="eyebrow mb-2">Direct Reports & Schools</div>
          )}
          <h1 className="text-[32px] font-semibold tracking-[-0.025em] leading-none text-[var(--text)]">
            {selected ? selected.name : "My Team"}
          </h1>
        </div>
        {!selected && (
          <p className="num text-[11.5px] text-[var(--text-4)]">
            Flag reports as “Direct report” and schools as type “school” on their People cards.
          </p>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="panel p-5"><Skeleton className="h-4 w-1/2 mb-3" /><Skeleton className="h-3 w-1/3" /></div>
          ))}
        </div>
      ) : everyone.length === 0 ? (
        <EmptyState
          icon={<FileText className="w-8 h-8" />}
          title="Nothing here yet"
          hint="Open someone on the People page, hit edit, and check “Direct report” — or add your schools as people with type “school”."
        />
      ) : selected ? (
        <PersonDetail person={selected} onChanged={fetchTeam} />
      ) : (
        <>
          {schools.length > 0 && (
            <section className="mb-10">
              <h2 className="eyebrow mb-3">Schools I Oversee <span className="num text-[10px] opacity-60">{schools.length}</span></h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {schools.map((s, i) => (
                  <SchoolCard key={s.id} s={s} delay={i + 1} onClick={() => setSelectedId(s.id)} />
                ))}
              </div>
            </section>
          )}

          {coordinators.length > 0 && (
            <section>
              <h2 className="eyebrow mb-3">Direct Reports <span className="num text-[10px] opacity-60">{coordinators.length}</span></h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {coordinators.map((c, i) => (
                  <CoordinatorCard key={c.id} c={c} delay={i + 1} onClick={() => setSelectedId(c.id)} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

/** on-track summary for a person's goals → [onTrack, total] or null */
function goalStatus(g: Goal[]): "up" | "warn" | "down" | null {
  let worst: "up" | "warn" | "down" | null = null;
  for (const goal of g) {
    if (goal.target == null || goal.readings.length === 0) continue;
    const latest = goal.readings[0].value;
    const t = goal.target;
    if (t === 0) continue;
    const ratio = goal.direction === "down" ? t / latest : latest / t;
    const st: "up" | "warn" | "down" = ratio >= 1 ? "up" : ratio >= 0.85 ? "warn" : "down";
    if (st === "down") return "down";
    if (st === "warn") worst = "warn";
    else if (!worst) worst = "up";
  }
  return worst;
}

const TASK_STATUSES = ["Not started", "In progress", "Blocked", "Done"];

function statusColor(status: string) {
  if (status === "Done") return "var(--up)";
  if (status === "Blocked") return "var(--down)";
  if (status === "In progress") return "var(--accent)";
  return "var(--text-3)";
}

function GoalsMiniPill({ goals }: { goals: Goal[] }) {
  if (goals.length === 0) return null;
  const st = goalStatus(goals);
  const withTargets = goals.filter((g) => g.readings.length > 0).length;
  return (
    <Pill tone={st === "up" || st === null ? "up" : st === "warn" ? "warn" : "down"}>
      {withTargets > 0
        ? `${goals.filter((g) => goalStatus([g]) === "up").length}/${withTargets} on track`
        : `${goals.length} goal${goals.length === 1 ? "" : "s"}`}
    </Pill>
  );
}

function SchoolCard({ s, onClick, delay }: { s: Person; onClick: () => void; delay: number }) {
  const openTasks = s.delegatedTasks.length;
  const blocked = s.delegatedTasks.filter((t) => t.status === "Blocked").length;
  return (
    <button onClick={onClick} className="hq-rise panel w-full text-left p-5 transition-all hover:border-[var(--line-strong)]" style={rise(delay)}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-[var(--text)] truncate">{s.name}</p>
          <p className="text-[12px] text-[var(--text-3)] truncate">{s.title || s.organization || "School"}</p>
        </div>
        {(s.oneOnOneDocUrl || s.email || s.phone) && <FileText className="w-4 h-4 shrink-0" style={{ color: "var(--accent)" }} />}
      </div>

      {latestMetrics(s.metrics, 2).map(([name, m]) => (
        <p key={name} className="text-[12px] text-[var(--text-2)] mb-1">
          <span className="text-[var(--text-4)]">{name}: </span>
          <span className="num font-medium">{fmtVal(m.value)}{m.unit ? ` ${m.unit}` : ""}</span>
        </p>
      ))}

      <div className="flex items-center justify-between gap-2 pt-2 mt-2 border-t border-[var(--line)]">
        <span className="num text-[11px] text-[var(--text-3)]">last touch {lastTouchLabel(s.lastContactAt)}</span>
        <div className="flex items-center gap-1.5">
          <GoalsMiniPill goals={s.goals} />
          {blocked > 0 && <Pill tone="down">{blocked} blocked</Pill>}
          {openTasks > 0 && <Pill tone="neutral">{openTasks} open</Pill>}
        </div>
      </div>
    </button>
  );
}

function CoordinatorCard({ c, onClick, delay }: { c: Person; onClick: () => void; delay: number }) {
  const openTasks = c.delegatedTasks.length;
  const blocked = c.delegatedTasks.filter((t) => t.status === "Blocked").length;
  return (
    <button onClick={onClick} className="hq-rise panel w-full text-left p-5 transition-all hover:border-[var(--line-strong)]" style={rise(delay)}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-[var(--text)] truncate">{c.name}</p>
          <p className="text-[12px] text-[var(--text-3)] truncate">{c.title || c.organization || "Coordinator"}</p>
        </div>
        {c.oneOnOneDocUrl && <FileText className="w-4 h-4 shrink-0" style={{ color: "var(--accent)" }} />}
      </div>

      {latestMetrics(c.metrics, 2).map(([name, m]) => (
        <p key={name} className="text-[12px] text-[var(--text-2)] mb-1">
          <span className="text-[var(--text-4)]">{name}: </span>
          <span className="num font-medium">{fmtVal(m.value)}{m.unit ? ` ${m.unit}` : ""}</span>
        </p>
      ))}

      <div className="flex items-center justify-between gap-2 pt-2 mt-2 border-t border-[var(--line)] flex-wrap">
        <span className="num text-[11px] text-[var(--text-3)]">
          {c.school ? <span className="inline-flex items-center gap-1 mr-1.5"><School className="w-3 h-3" />{c.school.name}</span> : null}
          last touch {lastTouchLabel(c.lastContactAt)}
        </span>
        <div className="flex items-center gap-1.5">
          <GoalsMiniPill goals={c.goals} />
          {blocked > 0 && <Pill tone="down">{blocked} blocked</Pill>}
          {openTasks > 0 && <Pill tone="neutral">{openTasks} open</Pill>}
        </div>
      </div>
    </button>
  );
}

function PersonDetail({ person: c, onChanged }: { person: Person; onChanged: () => void }) {
  async function changeTaskStatus(taskId: string, status: string) {
    try {
      const res = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: taskId, status }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onChanged();
    } catch (e) {
      console.error("Failed to update delegated task", e);
    }
  }

  const grouped = groupMetrics(c.metrics);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
      <div className="space-y-5">
        <div className="hq-rise panel p-6" style={rise(1)}>
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <p className="text-[17px] font-semibold text-[var(--text)]">{c.name}</p>
              <p className="text-[12.5px] text-[var(--text-3)] mt-0.5">{[c.title, c.organization].filter(Boolean).join(" · ")}</p>
              {(c.email || c.phone) && (
                <p className="num text-[11.5px] text-[var(--text-4)] mt-1">{[c.email, c.phone].filter(Boolean).join(" · ")}</p>
              )}
            </div>
            <Pill tone="neutral">last touch {lastTouchLabel(c.lastContactAt)}</Pill>
          </div>

          <OneOnOneDoc stakeholderId={c.id} url={c.oneOnOneDocUrl || ""} onSaved={onChanged} />

          {c.notes && (
            <p className="text-[12.5px] text-[var(--text-2)] bg-[var(--surface-1)] border border-[var(--line)] rounded-[var(--r-sm)] p-3 leading-relaxed mt-4">{c.notes}</p>
          )}
        </div>

        {c.goals.length > 0 && (
          <div className="hq-rise panel p-6" style={rise(2)}>
            <div className="eyebrow mb-3 flex items-center justify-between">
              <span>Goals</span>
              <GoalsMiniPill goals={c.goals} />
            </div>
            <div className="space-y-2">
              {c.goals.map((g) => (
                <GoalRow key={g.id} goal={g} onRecorded={onChanged} />
              ))}
            </div>
          </div>
        )}

        <div className="hq-rise panel p-6" style={rise(2)}>
          <div className="eyebrow mb-3">Metrics</div>
          {grouped.length === 0 ? (
            <p className="text-[12.5px] text-[var(--text-4)] py-3">Nothing tracked yet.</p>
          ) : (
            <div className="space-y-3">
              {grouped.map(([name, entries]) => (
                <MetricRow key={name} name={name} entries={entries} onChanged={onChanged} />
              ))}
            </div>
          )}
          <div className="mt-4">
            <AddMetricForm stakeholderId={c.id} onAdded={onChanged} />
          </div>
        </div>
      </div>

      <div className="space-y-5">
        <div className="hq-rise panel p-6" style={rise(2)}>
          <div className="eyebrow mb-3">Delegated Tasks</div>
          {c.delegatedTasks.length === 0 ? (
            <p className="text-[12.5px] text-[var(--text-4)] py-3">No open tasks assigned.</p>
          ) : (
            <div className="space-y-1.5">
              {c.delegatedTasks.map((t) => (
                <div key={t.id} className="flex items-center gap-2 border border-[var(--line)] rounded-[var(--r-sm)] px-3 py-2 bg-[var(--surface-1)]">
                  <span className="text-[12.5px] text-[var(--text-2)] leading-snug flex-1 min-w-0 truncate">{t.name}</span>
                  {t.sourceEmail?.gmailId && (
                    <a
                      href={`https://mail.google.com/mail/u/0/#all/${t.sourceEmail.gmailId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="p-1 rounded-md text-[var(--text-4)] hover:text-[var(--accent)] hover:bg-white/[0.06] transition-colors shrink-0"
                      title={`From email: ${t.sourceEmail.subject || ""}`}
                    >
                      <Mail className="w-3.5 h-3.5" />
                    </a>
                  )}
                  <select
                    value={t.status}
                    onChange={(e) => changeTaskStatus(t.id, e.target.value)}
                    title="Change status"
                    className="text-[11px] font-medium bg-[var(--surface-1)] rounded-[var(--r-sm)] px-1.5 py-1 border border-[var(--line)] focus:outline-none focus:border-[var(--line-strong)] cursor-pointer shrink-0"
                    style={{ color: statusColor(t.status) }}
                  >
                    {TASK_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="hq-rise panel p-6" style={rise(3)}>
          <div className="eyebrow mb-3">Recent Touchpoints</div>
          {c.interactions.length === 0 ? (
            <p className="text-[12.5px] text-[var(--text-4)] py-3">No interactions logged yet.</p>
          ) : (
            <div>
              {c.interactions.map((x) => (
                <div key={x.id} className="py-2.5 border-b border-[var(--line)] last:border-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Pill tone={x.direction === "inbound" ? "accent" : "neutral"}>{x.channel}</Pill>
                    <span className="num text-[10.5px] text-[var(--text-4)] ml-auto">{fmtDate(x.date)}</span>
                  </div>
                  <p className="text-[12.5px] text-[var(--text-2)] leading-snug">{x.summary}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function OneOnOneDoc({ stakeholderId, url, onSaved }: { stakeholderId: string; url: string; onSaved: () => void }) {
  const [editing, setEditing] = useState(!url);
  const [value, setValue] = useState(url);
  const [saving, setSaving] = useState(false);
  const inputCls =
    "w-full bg-[var(--surface-1)] border border-[var(--line)] text-[var(--text)] placeholder-[var(--text-4)] rounded-[var(--r-sm)] px-3 py-2 text-[13px] focus:outline-none focus:border-[var(--line-strong)]";

  async function save() {
    setSaving(true);
    await fetch("/api/people", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: stakeholderId, oneOnOneDocUrl: value }),
    }).catch(() => {});
    setSaving(false);
    setEditing(false);
    onSaved();
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="flex-1 flex items-center gap-2 border border-[var(--line)] rounded-[var(--r-sm)] px-3 py-2.5 bg-[var(--surface-1)] hover:border-[var(--line-strong)] transition-colors"
        >
          <FileText className="w-4 h-4 shrink-0" style={{ color: "var(--accent)" }} />
          <span className="text-[13px] font-medium text-[var(--text)]">Open 1:1 Doc</span>
          <span className="num text-[10.5px] text-[var(--text-4)] ml-auto truncate max-w-[180px]">{url.replace(/^https?:\/\/(docs\.google\.com|www\.google\.com)/, "")}</span>
        </a>
        <button onClick={() => setEditing(true)} className="text-[11px] px-2.5 py-2 rounded-[var(--r-sm)] border border-[var(--line)] text-[var(--text-3)] hover:text-[var(--text)] transition-colors cursor-pointer">
          Edit
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder="Paste your running Google Doc link…" className={inputCls} onKeyDown={(e) => e.key === "Enter" && save()} />
      <div className="flex gap-2">
        <Button variant="primary" size="sm" onClick={save} disabled={saving}>Save Link</Button>
        {!url && <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancel</Button>}
      </div>
    </div>
  );
}

function GoalRow({ goal: g, onRecorded }: { goal: Goal; onRecorded?: () => void }) {
  const latest = g.readings[0];
  const st = goalStatus([g]);
  const [recording, setRecording] = useState(false);
  const [val, setVal] = useState("");
  const [saving, setSaving] = useState(false);
  const fmt = (v: number) => {
    if (g.unit === "currency") return "$" + v.toLocaleString("en-US", { maximumFractionDigits: 0 });
    if (g.unit === "percent") return v.toFixed(1) + "%";
    if (Number.isInteger(v)) return String(v);
    return v.toFixed(1);
  };

  async function save() {
    const n = parseFloat(val);
    if (isNaN(n) || saving) return;
    setSaving(true);
    const res = await fetch("/api/goals/readings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kpiId: g.id, value: n }),
    }).catch(() => null);
    setSaving(false);
    if (res && res.ok) {
      setVal("");
      setRecording(false);
      onRecorded?.();
    } else {
      window.alert("Couldn't record the reading — please try again.");
    }
  }

  if (recording) {
    return (
      <div className="flex items-center gap-2 border border-[var(--accent)] rounded-[var(--r-sm)] px-3 py-2 bg-[var(--surface-1)]">
        <span className="text-[12.5px] text-[var(--text-2)] truncate flex-1 min-w-0">{g.name}</span>
        <input
          autoFocus
          type="number"
          step="any"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") { setRecording(false); setVal(""); }
          }}
          placeholder={g.unit === "percent" ? "%" : g.unit === "currency" ? "$" : "value"}
          className="w-20 shrink-0 num text-[12px] bg-[var(--surface-0)] border border-[var(--line-strong)] rounded-md px-2 py-1 text-[var(--text)] outline-none focus:border-[var(--accent)]"
        />
        <button onClick={save} disabled={saving || val === ""} className="p-1 rounded-md text-[var(--up)] hover:bg-white/[0.06] disabled:opacity-40 transition-colors" title="Save">
          <Check className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => { setRecording(false); setVal(""); }} className="p-1 rounded-md text-[var(--text-4)] hover:bg-white/[0.06] transition-colors" title="Cancel">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 border border-[var(--line)] rounded-[var(--r-sm)] px-3 py-2.5 bg-[var(--surface-1)] group/row">
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] text-[var(--text)] leading-snug truncate">
          {g.name}
          {g.sharedFromName && (
            <span className="num text-[9.5px] text-[var(--text-4)] ml-1.5">· shared via {g.sharedFromName}</span>
          )}
        </p>
        <p className="num text-[10.5px] text-[var(--text-4)] mt-0.5">
          {latest ? `${fmt(latest.value)}${g.target != null ? ` of ${fmt(g.target)}` : ""}` : "no readings yet"}
        </p>
      </div>
      {onRecorded && (
        <button
          onClick={() => setRecording(true)}
          className="p-1 rounded-md text-[var(--text-4)] hover:text-[var(--accent)] hover:bg-white/[0.06] transition-colors opacity-60 group-hover/row:opacity-100"
          title={`Record a ${g.frequency} value`}
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      )}
      {st ? (
        <Pill tone={st}>{st === "up" ? "on track" : st === "warn" ? "watch" : "off track"}</Pill>
      ) : (
        <Pill tone="neutral">—</Pill>
      )}
    </div>
  );
}

function MetricRow({ name, entries, onChanged }: { name: string; entries: Metric[]; onChanged: () => void }) {  const latest = entries[0];

  async function remove(id: string) {
    await fetch("/api/team/metrics", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => {});
    onChanged();
  }

  return (
    <div className="border border-[var(--line)] rounded-[var(--r-sm)] p-3 bg-[var(--surface-1)] group">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[12px] text-[var(--text-3)] flex-1 min-w-0 truncate">{name}</span>
        <button
          onClick={() => remove(latest.id)}
          title="Delete latest entry"
          className="opacity-0 group-hover:opacity-100 transition-opacity text-[#b3564d] cursor-pointer"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="num text-[20px] font-semibold text-[var(--text)] leading-none">
          {fmtVal(latest.value)}{latest.unit ? ` ${latest.unit}` : ""}
        </span>
        <span className="num text-[10.5px] text-[var(--text-4)]">{fmtDate(latest.recordedAt)}</span>
        {entries.length > 1 && (
          <span className="num text-[11px] text-[var(--text-4)] ml-auto">
            prev: {entries.slice(1, 5).map((e) => fmtVal(e.value)).join(" · ")}
          </span>
        )}
      </div>
      {latest.note && <p className="text-[11.5px] text-[var(--text-3)] mt-1 leading-snug">{latest.note}</p>}
    </div>
  );
}

const inputCls =
  "w-full bg-[var(--surface-1)] border border-[var(--line)] text-[var(--text)] placeholder-[var(--text-4)] rounded-[var(--r-sm)] px-3 py-2 text-[13px] focus:outline-none focus:border-[var(--line-strong)]";

function AddMetricForm({ stakeholderId, onAdded }: { stakeholderId: string; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", value: "", unit: "", recordedAt: "", note: "" });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    if (!form.name.trim() || form.value === "" || isNaN(Number(form.value))) return;
    setSaving(true);
    await fetch("/api/team/metrics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, stakeholderId, recordedAt: form.recordedAt || undefined }),
    }).catch(() => {});
    setForm({ name: "", value: "", unit: "", recordedAt: "", note: "" });
    setOpen(false);
    setSaving(false);
    onAdded();
  }

  if (!open) {
    return (
      <Button variant="ghost" onClick={() => setOpen(true)} className="w-full">
        <Plus className="w-3.5 h-3.5" /> Record Metric
      </Button>
    );
  }

  return (
    <div className="bg-[var(--surface-1)] border border-[var(--line)] rounded-[var(--r-md)] p-4 space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <input autoFocus value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Metric (e.g. Students enrolled)" className={`${inputCls} col-span-2`} />
        <input value={form.value} onChange={(e) => set("value", e.target.value)} placeholder="Value" type="number" className={inputCls} />
        <input value={form.unit} onChange={(e) => set("unit", e.target.value)} placeholder="Unit" className={inputCls} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input value={form.recordedAt} onChange={(e) => set("recordedAt", e.target.value)} type="date" className={inputCls} />
        <input value={form.note} onChange={(e) => set("note", e.target.value)} placeholder="Note (optional)" className={inputCls} />
      </div>
      <div className="flex gap-2">
        <Button variant="primary" size="sm" onClick={save} disabled={saving}>Save</Button>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  );
}

/** Latest entry per metric name, preserving first-seen order. */
function latestMetrics(metrics: Metric[], limit: number): [string, Metric][] {
  const seen = new Map<string, Metric>();
  for (const m of metrics) {
    if (!seen.has(m.name)) seen.set(m.name, m);
  }
  return [...seen.entries()].slice(0, limit);
}

function groupMetrics(metrics: Metric[]): [string, Metric[]][] {
  const groups = new Map<string, Metric[]>();
  for (const m of metrics) {
    if (!groups.has(m.name)) groups.set(m.name, []);
    groups.get(m.name)!.push(m);
  }
  return [...groups.entries()];
}

function fmtVal(v: number) {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

function lastTouchLabel(d?: string | null) {
  if (!d) return "never";
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
