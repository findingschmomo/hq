"use client";

import { useCallback, useEffect, useState } from "react";
import { Users, Plus, Trash2, MessageSquarePlus, AlertTriangle } from "lucide-react";
import { Button, EmptyState, Pill, Skeleton, rise } from "@/components/ui/kit";

interface Interaction {
  id: string;
  channel: string;
  direction: string;
  summary: string;
  date: string;
  followUpNeeded: boolean;
  followUpDate?: string | null;
  followUpDone: boolean;
  sentiment?: string | null;
}

interface Stakeholder {
  id: string;
  name: string;
  organization?: string | null;
  title?: string | null;
  type: string;
  email?: string | null;
  phone?: string | null;
  importance: string;
  cadenceDays?: number | null;
  notes?: string | null;
  lastContactAt?: string | null;
  interactions: Interaction[];
  needsContact: boolean;
}

const TYPES = ["staff", "board", "funder", "partner", "resident", "government", "vendor", "other"];
const CHANNELS = ["email", "call", "meeting", "text", "event", "other"];
const importanceTone: Record<string, "down" | "warn" | "neutral"> = { high: "down", normal: "neutral", low: "neutral" };

export default function StakeholdersPage() {
  const [stakeholders, setStakeholders] = useState<Stakeholder[]>([]);
  const [typeFilter, setTypeFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const fetchStakeholders = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (typeFilter !== "all") params.set("type", typeFilter);
      if (query.trim()) params.set("q", query.trim());
      const res = await fetch(`/api/stakeholders?${params}`);
      const data = await res.json();
      setStakeholders(data.stakeholders || []);
    } catch {
      console.error("Failed to fetch stakeholders");
    } finally {
      setLoading(false);
    }
  }, [typeFilter, query]);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(fetchStakeholders, query ? 250 : 0);
    return () => clearTimeout(t);
  }, [fetchStakeholders, query]);

  async function remove(id: string) {
    await fetch("/api/stakeholders", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setSelectedId(null);
    fetchStakeholders();
  }

  const selected = stakeholders.find((s) => s.id === selectedId) || null;

  return (
    <div className="relative z-10 w-full mx-auto pt-4 pb-16">
      <div className="hq-rise flex flex-wrap justify-between items-end gap-4 mb-8" style={rise(0)}>
        <div>
          <div className="eyebrow mb-2">Relationships</div>
          <h1 className="text-[32px] font-semibold tracking-[-0.025em] leading-none text-[var(--text)]">Stakeholders</h1>
        </div>
        <Button variant="primary" onClick={() => setShowAdd(true)}>
          <Plus className="w-3.5 h-3.5" /> Add Person
        </Button>
      </div>

      {/* Filters */}
      <div className="hq-rise flex flex-wrap gap-2 mb-6 items-center" style={rise(1)}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name or organization…"
          className="flex-1 min-w-[200px] max-w-xs bg-[var(--surface-1)] border border-[var(--line)] text-[var(--text)] placeholder-[var(--text-4)] rounded-[var(--r-md)] px-3.5 py-2 text-[13px] focus:outline-none focus:border-[var(--line-strong)]"
        />
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {["all", ...TYPES].map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-2 rounded-[10px] text-[12px] font-medium whitespace-nowrap capitalize transition-all border ${
                typeFilter === t
                  ? "bg-[var(--surface-2)] text-[var(--text)] border-[var(--line-strong)]"
                  : "text-[var(--text-3)] hover:text-[var(--text-2)] border-transparent hover:bg-[var(--surface-1)]"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {showAdd && (
        <AddStakeholderForm
          onDone={() => {
            setShowAdd(false);
            fetchStakeholders();
          }}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="panel p-5"><Skeleton className="h-4 w-1/3 mb-3" /><Skeleton className="h-3 w-1/4" /></div>
          ))}
        </div>
      ) : stakeholders.length === 0 ? (
        <EmptyState
          icon={<Users className="w-8 h-8" />}
          title="No people yet"
          hint="Track board members, funders, partners, and staff — plus every touchpoint with them."
          action={<Button variant="primary" onClick={() => setShowAdd(true)}>Add your first contact</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Directory */}
          <div className="space-y-3">
            {stakeholders.map((s, i) => (
              <StakeholderRow
                key={s.id}
                s={s}
                active={s.id === selectedId}
                delay={i + 2}
                onClick={() => setSelectedId(s.id === selectedId ? null : s.id)}
              />
            ))}
          </div>

          {/* Detail */}
          {selected && (
            <DetailPanel stakeholder={selected} onLogged={fetchStakeholders} onRemove={() => remove(selected.id)} onClose={() => setSelectedId(null)} />
          )}
        </div>
      )}
    </div>
  );
}

function StakeholderRow({ s, active, onClick, delay }: { s: Stakeholder; active: boolean; onClick: () => void; delay: number }) {
  const openFollowUps = s.interactions.filter((x) => x.followUpNeeded && !x.followUpDone).length;
  return (
    <button
      onClick={onClick}
      className={`hq-rise panel w-full text-left p-4 transition-all ${active ? "border-[var(--line-strong)] bg-[var(--surface-2)]" : "hover:border-[var(--line-strong)]"}`}
      style={rise(delay)}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <p className="text-[14px] font-semibold text-[var(--text)]">{s.name}</p>
            {s.importance !== "normal" && <Pill tone={importanceTone[s.importance]}>{s.importance} priority</Pill>}
            {s.needsContact && (
              <Pill tone="warn"><AlertTriangle className="w-3 h-3" /> due for contact</Pill>
            )}
          </div>
          <p className="text-[12px] text-[var(--text-3)] truncate">
            {s.title ? `${s.title}, ` : ""}{s.organization || s.type}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="num text-[11px] text-[var(--text-3)]">{lastTouchLabel(s.lastContactAt)}</p>
          {openFollowUps > 0 && <p className="num text-[11px]" style={{ color: "var(--warn)" }}>{openFollowUps} follow-up{openFollowUps > 1 ? "s" : ""}</p>}
        </div>
      </div>
    </button>
  );
}

function DetailPanel({
  stakeholder,
  onLogged,
  onRemove,
  onClose,
}: {
  stakeholder: Stakeholder;
  onLogged: () => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  return (
    <div className="hq-rise panel p-6 h-fit lg:sticky lg:top-8 space-y-5" style={{ animationDelay: "120ms" }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[17px] font-semibold text-[var(--text)]">{stakeholder.name}</p>
          <p className="text-[12.5px] text-[var(--text-3)] mt-0.5">
            {stakeholder.title && `${stakeholder.title} · `}
            {stakeholder.organization || stakeholder.type}
          </p>
          {(stakeholder.email || stakeholder.phone) && (
            <p className="num text-[11.5px] text-[var(--text-4)] mt-1">{[stakeholder.email, stakeholder.phone].filter(Boolean).join(" · ")}</p>
          )}
        </div>
        <div className="flex gap-1">
          <button onClick={onClose} className="p-2 rounded-lg text-[var(--text-4)] hover:text-[var(--text-2)] hover:bg-[var(--surface-1)] transition-colors text-[13px]">✕</button>
          <button onClick={onRemove} className="p-2 rounded-lg text-[var(--text-4)] hover:text-[var(--down)] hover:bg-[var(--surface-1)] transition-colors" title="Delete"><Trash2 className="w-4 h-4" /></button>
        </div>
      </div>

      {stakeholder.notes && (
        <p className="text-[12.5px] text-[var(--text-2)] bg-[var(--surface-1)] border border-[var(--line)] rounded-[var(--r-sm)] p-3 leading-relaxed">{stakeholder.notes}</p>
      )}

      <LogInteractionForm stakeholderId={stakeholder.id} onLogged={onLogged} />

      <div>
        <div className="eyebrow mb-2">Recent Touchpoints</div>
        {stakeholder.interactions.length === 0 ? (
          <p className="text-[12.5px] text-[var(--text-4)] py-4 text-center">No interactions logged yet.</p>
        ) : (
          <div className="space-y-0">
            {stakeholder.interactions.map((x) => (
              <div key={x.id} className="py-3 border-b border-[var(--line)] last:border-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Pill tone={x.direction === "inbound" ? "accent" : "neutral"}>{x.channel}</Pill>
                  {x.sentiment === "positive" && <Pill tone="up">positive</Pill>}
                  {x.sentiment === "negative" && <Pill tone="down">negative</Pill>}
                  <span className="num text-[10.5px] text-[var(--text-4)] ml-auto">{fmtDate(x.date)}</span>
                </div>
                <p className="text-[12.5px] text-[var(--text-2)] leading-snug">{x.summary}</p>
                {x.followUpNeeded && !x.followUpDone && (
                  <p className="text-[11.5px] mt-1 inline-flex items-center gap-1" style={{ color: "var(--warn)" }}>
                    Follow-up{x.followUpDate ? ` by ${fmtDate(x.followUpDate)}` : ""}
                  </p>
                )}
                {x.followUpDone && <p className="text-[11.5px] mt-1" style={{ color: "var(--up)" }}>Follow-up done ✓</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function LogInteractionForm({ stakeholderId, onLogged }: { stakeholderId: string; onLogged: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ channel: "meeting", direction: "outbound", summary: "", followUpNeeded: false, followUpDate: "", sentiment: "" });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    if (!form.summary.trim()) return;
    setSaving(true);
    await fetch("/api/stakeholders/interactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, stakeholderId }),
    }).catch(() => {});
    setForm({ channel: "meeting", direction: "outbound", summary: "", followUpNeeded: false, followUpDate: "", sentiment: "" });
    setOpen(false);
    setSaving(false);
    onLogged();
  }

  if (!open) {
    return (
      <Button variant="ghost" onClick={() => setOpen(true)} className="w-full">
        <MessageSquarePlus className="w-3.5 h-3.5" /> Log Interaction
      </Button>
    );
  }

  const inputCls =
    "w-full bg-[var(--surface-1)] border border-[var(--line)] text-[var(--text)] placeholder-[var(--text-4)] rounded-[var(--r-sm)] px-3 py-2 text-[13px] focus:outline-none focus:border-[var(--line-strong)]";

  return (
    <div className="bg-[var(--surface-1)] border border-[var(--line)] rounded-[var(--r-md)] p-4 space-y-3">
      <textarea autoFocus rows={2} value={form.summary} onChange={(e) => set("summary", e.target.value)} placeholder="What did you discuss?" className={inputCls} />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <select value={form.channel} onChange={(e) => set("channel", e.target.value)} className={inputCls}>
          {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={form.direction} onChange={(e) => set("direction", e.target.value)} className={inputCls}>
          <option value="outbound">outbound</option>
          <option value="inbound">inbound</option>
        </select>
        <select value={form.sentiment} onChange={(e) => set("sentiment", e.target.value)} className={inputCls}>
          <option value="">sentiment…</option>
          <option value="positive">positive</option>
          <option value="neutral">neutral</option>
          <option value="negative">negative</option>
        </select>
      </div>
      <label className="flex items-center gap-2 text-[12px] text-[var(--text-2)] cursor-pointer select-none">
        <input type="checkbox" checked={form.followUpNeeded} onChange={(e) => set("followUpNeeded", e.target.checked)} className="accent-[var(--accent)]" />
        Needs follow-up
      </label>
      {form.followUpNeeded && (
        <input type="date" value={form.followUpDate} onChange={(e) => set("followUpDate", e.target.value)} className={inputCls} />
      )}
      <div className="flex gap-2">
        <Button variant="primary" size="sm" onClick={save} disabled={saving}>Save</Button>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  );
}

const inputCls =
  "w-full bg-[var(--surface-1)] border border-[var(--line)] text-[var(--text)] placeholder-[var(--text-4)] rounded-[var(--r-sm)] px-3 py-2 text-[13px] focus:outline-none focus:border-[var(--line-strong)]";

function AddStakeholderForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [form, setForm] = useState({
    name: "", organization: "", title: "", type: "partner",
    email: "", phone: "", importance: "normal", cadenceDays: "", notes: "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    await fetch("/api/stakeholders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    }).catch(() => {});
    setSaving(false);
    onDone();
  }

  return (
    <div className="hq-rise elevated p-5 mb-6" style={rise(2)}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
        <div>
          <div className="eyebrow !text-[9.5px] mb-1.5">Name</div>
          <input autoFocus value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Full name" className={inputCls} />
        </div>
        <div>
          <div className="eyebrow !text-[9.5px] mb-1.5">Organization</div>
          <input value={form.organization} onChange={(e) => set("organization", e.target.value)} placeholder="Company / org" className={inputCls} />
        </div>
        <div>
          <div className="eyebrow !text-[9.5px] mb-1.5">Title</div>
          <input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Role" className={inputCls} />
        </div>
        <div>
          <div className="eyebrow !text-[9.5px] mb-1.5">Type</div>
          <select value={form.type} onChange={(e) => set("type", e.target.value)} className={inputCls}>
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <div className="eyebrow !text-[9.5px] mb-1.5">Importance</div>
          <select value={form.importance} onChange={(e) => set("importance", e.target.value)} className={inputCls}>
            <option value="high">high</option>
            <option value="normal">normal</option>
            <option value="low">low</option>
          </select>
        </div>
        <div>
          <div className="eyebrow !text-[9.5px] mb-1.5">Contact every (days)</div>
          <input type="number" value={form.cadenceDays} onChange={(e) => set("cadenceDays", e.target.value)} placeholder="e.g. 30" className={inputCls} onKeyDown={(e) => e.key === "Enter" && save()} />
        </div>
        <div className="sm:col-span-2">
          <div className="eyebrow !text-[9.5px] mb-1.5">Email</div>
          <input value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="name@org.org" className={inputCls} />
        </div>
        <div>
          <div className="eyebrow !text-[9.5px] mb-1.5">Phone</div>
          <input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="(215) 555-0100" className={inputCls} />
        </div>
        <div className="sm:col-span-3">
          <div className="eyebrow !text-[9.5px] mb-1.5">Notes</div>
          <textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Context — how you met, what they care about…" className={inputCls} />
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="primary" onClick={save} disabled={saving}>Add Person</Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

function lastTouchLabel(d?: string | null) {
  if (!d) return "never contacted";
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
