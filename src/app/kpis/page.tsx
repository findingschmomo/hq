"use client";

import { useCallback, useEffect, useState } from "react";
import { BarChart3, Plus, Target, Trash2, User } from "lucide-react";
import { Button, EmptyState, Pill, Skeleton, rise } from "@/components/ui/kit";
import { Sparkline } from "@/components/sparkline";

interface Reading {
  id: string;
  value: number;
  periodStart: string;
  note?: string | null;
}

interface Kpi {
  id: string;
  name: string;
  description?: string | null;
  category: string;
  unit: string;
  target?: number | null;
  direction: string; // up = higher is better
  frequency: string;
  owner?: string | null;
  readings: Reading[];
}

const CATEGORIES = ["programs", "fundraising", "operations", "finance", "impact", "staff"];

export default function KpisPage() {
  const [kpis, setKpis] = useState<Kpi[]>([]);
  const [category, setCategory] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const fetchKpis = useCallback(async () => {
    try {
      const q = category === "all" ? "" : `?category=${category}`;
      const res = await fetch(`/api/kpis${q}`);
      const data = await res.json();
      setKpis(data.kpis || []);
    } catch {
      console.error("Failed to fetch KPIs");
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => {
    setLoading(true);
    fetchKpis();
  }, [fetchKpis]);

  async function recordValue(kpiId: string, value: number) {
    await fetch("/api/kpis/readings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kpiId, value }),
    });
    fetchKpis();
  }

  async function remove(kpiId: string) {
    await fetch("/api/kpis", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: kpiId }),
    });
    fetchKpis();
  }

  return (
    <div className="relative z-10 w-full mx-auto pt-4 pb-16">
      <div className="hq-rise flex flex-wrap justify-between items-end gap-4 mb-8" style={rise(0)}>
        <div>
          <div className="eyebrow mb-2">Information Database</div>
          <h1 className="text-[32px] font-semibold tracking-[-0.025em] leading-none text-[var(--text)]">KPIs</h1>
        </div>
        <Button variant="primary" onClick={() => setShowAdd(true)}>
          <Plus className="w-3.5 h-3.5" /> Add KPI
        </Button>
      </div>

      {/* Category filter */}
      <div className="hq-rise flex gap-1.5 mb-6 overflow-x-auto pb-1" style={rise(1)}>
        {["all", ...CATEGORIES].map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`px-3.5 py-2 rounded-[10px] text-[12.5px] font-medium whitespace-nowrap capitalize transition-all border ${
              category === c
                ? "bg-[var(--surface-2)] text-[var(--text)] border-[var(--line-strong)]"
                : "text-[var(--text-3)] hover:text-[var(--text-2)] border-transparent hover:bg-[var(--surface-1)]"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {showAdd && (
        <AddKpiForm
          onDone={() => {
            setShowAdd(false);
            fetchKpis();
          }}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="panel p-5"><Skeleton className="h-4 w-1/2 mb-4" /><Skeleton className="h-10 w-full mb-3" /><Skeleton className="h-3 w-1/3" /></div>
          ))}
        </div>
      ) : kpis.length === 0 ? (
        <EmptyState
          icon={<BarChart3 className="w-8 h-8" />}
          title="No KPIs yet"
          hint="Track what matters — program outcomes, fundraising goals, operational metrics."
          action={<Button variant="primary" onClick={() => setShowAdd(true)}>Add your first KPI</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {kpis.map((kpi, i) => (
            <KpiCard key={kpi.id} kpi={kpi} onRecord={recordValue} onRemove={() => remove(kpi.id)} delay={i + 2} />
          ))}
        </div>
      )}
    </div>
  );
}

function formatValue(v: number, unit: string) {
  if (unit === "currency") return "$" + v.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (unit === "percent") return v.toFixed(1) + "%";
  if (unit === "hours") return v.toLocaleString("en-US") + "h";
  return v.toLocaleString("en-US");
}

function statusOf(kpi: Kpi): "up" | "warn" | "down" | null {
  if (kpi.target == null || kpi.readings.length === 0) return null;
  const latest = kpi.readings[0].value;
  const t = kpi.target;
  if (t === 0) return null;
  const ratio = kpi.direction === "down" ? t / latest : latest / t;
  if (ratio >= 1) return "up";
  if (ratio >= 0.85) return "warn";
  return "down";
}

function KpiCard({
  kpi,
  onRecord,
  onRemove,
  delay,
}: {
  kpi: Kpi;
  onRecord: (id: string, value: number) => void;
  onRemove: () => void;
  delay: number;
}) {
  const [recording, setRecording] = useState(false);
  const [val, setVal] = useState("");
  const latest = kpi.readings[0];
  const st = statusOf(kpi);
  const series = [...kpi.readings].reverse().map((r) => r.value); // oldest → newest

  // progress toward target
  let progress: number | null = null;
  if (kpi.target != null && latest && kpi.target !== 0) {
    progress =
      kpi.direction === "down"
        ? Math.min(100, Math.max(0, (kpi.target / latest.value) * 100))
        : Math.min(100, Math.max(0, (latest.value / kpi.target) * 100));
  }

  const submit = () => {
    const n = parseFloat(val);
    if (!isNaN(n)) onRecord(kpi.id, n);
    setVal("");
    setRecording(false);
  };

  return (
    <div className="hq-rise panel group p-5 flex flex-col transition-colors hover:border-[var(--line-strong)]" style={rise(delay)}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="min-w-0">
          <p className="text-[14.5px] font-semibold text-[var(--text)] leading-snug truncate">{kpi.name}</p>
          <p className="text-[11px] text-[var(--text-3)] capitalize mt-0.5">{kpi.category} · {kpi.frequency}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {st && <Pill tone={st}>{st === "up" ? "on track" : st === "warn" ? "watch" : "off track"}</Pill>}
          <button onClick={onRemove} className="p-1.5 rounded-lg text-[var(--text-4)] hover:text-[var(--down)] hover:bg-[var(--surface-1)] transition-colors opacity-0 group-hover:opacity-100" title="Delete KPI">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Latest value */}
      <div className="flex items-baseline gap-2 mt-3">
        <span className="num text-[28px] font-semibold leading-none text-[var(--text)]">
          {latest ? formatValue(latest.value, kpi.unit) : "—"}
        </span>
        {kpi.target != null && (
          <span className="num text-[12.5px] text-[var(--text-3)] inline-flex items-center gap-1">
            <Target className="w-3 h-3" /> {formatValue(kpi.target, kpi.unit)}
          </span>
        )}
      </div>

      {/* Progress bar */}
      {progress !== null && (
        <div className="mt-3 h-[4px] rounded-full bg-white/[0.06] overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${progress}%`,
              background: st === "up" ? "var(--up)" : st === "warn" ? "var(--warn)" : "var(--down)",
              opacity: 0.85,
            }}
          />
        </div>
      )}

      {/* Trend */}
      <div className="mt-4 min-h-[40px]">
        {series.length >= 2 ? (
          <Sparkline data={series} color={st === "down" ? "#fb7185" : st === "warn" ? "#fbbf24" : "#34d399"} area idSeed={`kpi-${kpi.id}`} />
        ) : (
          <p className="text-[11.5px] text-[var(--text-4)]">{latest ? periodLabel(latest.periodStart) : "No readings yet"}</p>
        )}
      </div>

      {/* Footer: owner + record */}
      <div className="mt-auto pt-4 flex items-center justify-between gap-2 border-t border-[var(--line)]">
        <span className="text-[11px] text-[var(--text-3)] inline-flex items-center gap-1 min-w-0 truncate">
          {kpi.owner ? <><User className="w-3 h-3 shrink-0" /> {kpi.owner}</> : `${kpi.readings.length} reading${kpi.readings.length === 1 ? "" : "s"}`}
        </span>
        {recording ? (
          <input
            autoFocus
            type="number"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            onBlur={submit}
            placeholder={kpi.unit === "percent" ? "42.5" : "value"}
            className="num w-24 bg-[var(--surface-1)] border border-[var(--accent)]/40 text-[var(--text)] rounded-[var(--r-sm)] px-2 py-1 text-[12px] focus:outline-none"
          />
        ) : (
          <button onClick={() => setRecording(true)} className="btn-ghost !py-1 !px-2.5 !text-[11.5px] shrink-0">
            Record
          </button>
        )}
      </div>
    </div>
  );
}

function periodLabel(d: string) {
  const date = new Date(d);
  return `Last reading · ${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

const inputCls =
  "w-full bg-[var(--surface-1)] border border-[var(--line)] text-[var(--text)] placeholder-[var(--text-4)] rounded-[var(--r-sm)] px-3 py-2 text-[13px] focus:outline-none focus:border-[var(--line-strong)]";

function AddKpiForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [form, setForm] = useState({
    name: "", description: "", category: "programs", unit: "number",
    target: "", direction: "up", frequency: "monthly", owner: "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    await fetch("/api/kpis", {
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
        <div className="sm:col-span-2">
          <div className="eyebrow !text-[9.5px] mb-1.5">Name</div>
          <input autoFocus value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Students served per month" className={inputCls} />
        </div>
        <div>
          <div className="eyebrow !text-[9.5px] mb-1.5">Target</div>
          <input type="number" value={form.target} onChange={(e) => set("target", e.target.value)} placeholder="optional" className={inputCls} />
        </div>
        <div>
          <div className="eyebrow !text-[9.5px] mb-1.5">Category</div>
          <select value={form.category} onChange={(e) => set("category", e.target.value)} className={inputCls}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <div className="eyebrow !text-[9.5px] mb-1.5">Unit</div>
          <select value={form.unit} onChange={(e) => set("unit", e.target.value)} className={inputCls}>
            <option value="number">number</option>
            <option value="percent">percent</option>
            <option value="currency">currency</option>
            <option value="hours">hours</option>
          </select>
        </div>
        <div>
          <div className="eyebrow !text-[9.5px] mb-1.5">Frequency</div>
          <select value={form.frequency} onChange={(e) => set("frequency", e.target.value)} className={inputCls}>
            <option value="weekly">weekly</option>
            <option value="monthly">monthly</option>
            <option value="quarterly">quarterly</option>
          </select>
        </div>
        <div>
          <div className="eyebrow !text-[9.5px] mb-1.5">Direction</div>
          <select value={form.direction} onChange={(e) => set("direction", e.target.value)} className={inputCls}>
            <option value="up">higher is better</option>
            <option value="down">lower is better</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <div className="eyebrow !text-[9.5px] mb-1.5">Owner</div>
          <input value={form.owner} onChange={(e) => set("owner", e.target.value)} placeholder="Staff member responsible" className={inputCls} onKeyDown={(e) => e.key === "Enter" && save()} />
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="primary" onClick={save} disabled={saving}>Create KPI</Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
