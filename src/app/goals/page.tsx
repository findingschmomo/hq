"use client";

import { useCallback, useEffect, useState } from "react";
import { BarChart3, CopyPlus, Plus, Target, Trash2, User } from "lucide-react";
import { Button, EmptyState, Pill, Skeleton, rise } from "@/components/ui/kit";
import { Sparkline } from "@/components/sparkline";

interface Reading {
  id: string;
  value: number;
  periodStart: string;
  note?: string | null;
}

interface GoalOwner {
  id: string;
  name: string;
}

interface Goal {
  id: string;
  name: string;
  description?: string | null;
  category: string;
  unit: string;
  target?: number | null;
  direction: string; // up = higher is better
  frequency: string;
  owner?: string | null;
  ownerId?: string | null;
  ownerRef?: GoalOwner | null;
  readings: Reading[];
}

const CATEGORIES = ["programs", "fundraising", "operations", "finance", "impact", "staff"];
type Scope = "mine" | "team" | "all";

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [category, setCategory] = useState<string>("all");
  const [scope, setScope] = useState<Scope>("mine");
  const [people, setPeople] = useState<{ id: string; name: string; type: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const fetchGoals = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (category !== "all") params.set("category", category);
      if (scope !== "all") params.set("scope", scope);
      const res = await fetch(`/api/goals?${params.toString()}`);
      const data = await res.json();
      setGoals(data.goals || []);
    } catch {
      console.error("Failed to fetch goals");
    } finally {
      setLoading(false);
    }
  }, [category, scope]);

  // people list for the owner picker
  useEffect(() => {
    fetch("/api/people")
      .then((r) => r.json())
      .then((d) => setPeople(d.stakeholders || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchGoals();
  }, [fetchGoals]);

  async function recordValue(goalId: string, value: number) {
    await fetch("/api/goals/readings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kpiId: goalId, value }),
    });
    fetchGoals();
  }

  async function remove(goalId: string) {
    await fetch("/api/goals", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: goalId }),
    });
    fetchGoals();
  }

  async function duplicateToTeam(goal: Goal) {
    if (!window.confirm(`Copy "${goal.name}" to every other direct report? People who already have this goal are skipped.`)) return;
    const res = await fetch("/api/goals/duplicate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: goal.id }),
    }).catch(() => null);
    if (res && res.ok) fetchGoals();
    else window.alert("Couldn't duplicate the goal — please try again.");
  }

  const visible = goals.filter((g) =>
    scope === "mine" ? !g.ownerId : scope === "team" ? Boolean(g.ownerId) : true
  );

  // team view → group by person
  const grouped =
    scope === "team"
      ? [...new Set(visible.map((g) => g.ownerRef?.name || g.owner || "Unassigned"))].map((name) => ({
          name,
          items: visible.filter((g) => (g.ownerRef?.name || g.owner || "Unassigned") === name),
        }))
      : [{ name: "", items: visible }];

  return (
    <div className="relative z-10 w-full mx-auto pt-4 pb-16">
      <div className="hq-rise flex flex-wrap justify-between items-end gap-4 mb-8" style={rise(0)}>
        <div>
          <div className="eyebrow mb-2">Information Database</div>
          <h1 className="text-[32px] font-semibold tracking-[-0.025em] leading-none text-[var(--text)]">Goals</h1>
        </div>
        <Button variant="primary" onClick={() => setShowAdd(true)}>
          <Plus className="w-3.5 h-3.5" /> Add Goal
        </Button>
      </div>

      {/* Scope tabs + category filter */}
      <div className="hq-rise flex flex-wrap gap-3 mb-6" style={rise(1)}>
        <div className="flex items-center rounded-[10px] border border-[var(--line)] p-0.5 shrink-0">
          {(
            [
              ["mine", "Mine"],
              ["team", "Team"],
              ["all", "All"],
            ] as [Scope, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setScope(key)}
              className={`px-3.5 py-1.5 rounded-[8px] text-[12.5px] font-medium transition-all ${
                scope === key
                  ? "bg-[var(--surface-2)] text-[var(--text)]"
                  : "text-[var(--text-3)] hover:text-[var(--text-2)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
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
      </div>

      {showAdd && (
        <AddGoalForm
          people={people}
          defaultScope={scope}
          onDone={() => {
            setShowAdd(false);
            fetchGoals();
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
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<BarChart3 className="w-8 h-8" />}
          title={scope === "mine" ? "No personal goals yet" : scope === "team" ? "No team goals yet" : "No goals yet"}
          hint={
            scope === "mine"
              ? "Track what matters — program outcomes, fundraising targets, operational numbers."
              : scope === "team"
                ? "Add a goal and assign it to one of your people to keep them on track."
                : "Track what matters — for you and everyone you support."
          }
          action={<Button variant="primary" onClick={() => setShowAdd(true)}>Add your first goal</Button>}
        />
      ) : (
        <div className="space-y-8">
          {grouped.map((group) => (
            <div key={group.name || "all"}>
              {group.name && (
                <h2 className="eyebrow mb-3 flex items-center gap-1.5">
                  <User className="w-3 h-3" /> {group.name}
                  <span className="num text-[10px] opacity-60">{group.items.length}</span>
                </h2>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {group.items.map((goal, i) => (
                  <GoalCard
                    key={goal.id}
                    goal={goal}
                    showOwner={scope !== "team"}
                    onRecord={recordValue}
                    onRemove={() => remove(goal.id)}
                    onDuplicate={goal.ownerRef ? () => duplicateToTeam(goal) : undefined}
                    delay={i + 2}
                  />
                ))}
              </div>
            </div>
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

function statusOf(goal: Goal): "up" | "warn" | "down" | null {
  if (goal.target == null || goal.readings.length === 0) return null;
  const latest = goal.readings[0].value;
  const t = goal.target;
  if (t === 0) return null;
  const ratio = goal.direction === "down" ? t / latest : latest / t;
  if (ratio >= 1) return "up";
  if (ratio >= 0.85) return "warn";
  return "down";
}

function GoalCard({
  goal,
  showOwner,
  onRecord,
  onRemove,
  onDuplicate,
  delay,
}: {
  goal: Goal;
  showOwner?: boolean;
  onRecord: (id: string, value: number) => void;
  onRemove: () => void;
  onDuplicate?: () => void;
  delay: number;
}) {
  const [recording, setRecording] = useState(false);
  const [val, setVal] = useState("");
  const latest = goal.readings[0];
  const st = statusOf(goal);
  const series = [...goal.readings].reverse().map((r) => r.value); // oldest → newest

  // progress toward target
  let progress: number | null = null;
  if (goal.target != null && latest && goal.target !== 0) {
    progress =
      goal.direction === "down"
        ? Math.min(100, Math.max(0, (goal.target / latest.value) * 100))
        : Math.min(100, Math.max(0, (latest.value / goal.target) * 100));
  }

  const submit = () => {
    const n = parseFloat(val);
    if (!isNaN(n)) onRecord(goal.id, n);
    setVal("");
    setRecording(false);
  };

  return (
    <div className="hq-rise panel group p-5 flex flex-col transition-colors hover:border-[var(--line-strong)]" style={rise(delay)}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="min-w-0">
          <p className="text-[14.5px] font-semibold text-[var(--text)] leading-snug truncate">{goal.name}</p>
          <p className="text-[11px] text-[var(--text-3)] capitalize mt-0.5">{goal.category} · {goal.frequency}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {st && <Pill tone={st}>{st === "up" ? "on track" : st === "warn" ? "watch" : "off track"}</Pill>}
          {onDuplicate && (
            <button
              onClick={onDuplicate}
              className="p-1.5 rounded-lg text-[var(--text-4)] hover:text-[var(--accent)] hover:bg-[var(--surface-1)] transition-colors opacity-0 group-hover:opacity-100"
              title="Copy to every other direct report"
            >
              <CopyPlus className="w-3.5 h-3.5" />
            </button>
          )}
          <button onClick={onRemove} className="p-1.5 rounded-lg text-[var(--text-4)] hover:text-[var(--down)] hover:bg-[var(--surface-1)] transition-colors opacity-0 group-hover:opacity-100" title="Delete goal">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {showOwner && (goal.ownerRef?.name || goal.owner) && (
        <span className="mt-1 inline-flex w-fit items-center gap-1 num text-[10px] text-[var(--text-3)] rounded-full px-2 py-0.5 bg-[var(--surface-2)] border border-[var(--line)]">
          <User className="w-2.5 h-2.5" /> {goal.ownerRef?.name || goal.owner}
        </span>
      )}

      {/* Latest value */}
      <div className="flex items-baseline gap-2 mt-3">
        <span className="num text-[28px] font-semibold leading-none text-[var(--text)]">
          {latest ? formatValue(latest.value, goal.unit) : "—"}
        </span>
        {goal.target != null && (
          <span className="num text-[12.5px] text-[var(--text-3)] inline-flex items-center gap-1">
            <Target className="w-3 h-3" /> {formatValue(goal.target, goal.unit)}
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
          <Sparkline data={series} color={st === "down" ? "#fb7185" : st === "warn" ? "#fbbf24" : "#34d399"} area idSeed={`goal-${goal.id}`} />
        ) : (
          <p className="text-[11.5px] text-[var(--text-4)]">{latest ? periodLabel(latest.periodStart) : "No readings yet"}</p>
        )}
      </div>

      {/* Footer: owner + record */}
      <div className="mt-auto pt-4 flex items-center justify-between gap-2 border-t border-[var(--line)]">
        <span className="text-[11px] text-[var(--text-3)] inline-flex items-center gap-1 min-w-0 truncate">
          {!showOwner && goal.ownerRef?.name ? (
            <><User className="w-3 h-3 shrink-0" /> {goal.ownerRef.name}</>
          ) : (
            `${goal.readings.length} reading${goal.readings.length === 1 ? "" : "s"}`
          )}
        </span>
        {recording ? (
          <input
            autoFocus
            type="number"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            onBlur={submit}
            placeholder={goal.unit === "percent" ? "42.5" : "value"}
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

function AddGoalForm({
  people,
  defaultScope,
  onDone,
  onCancel,
}: {
  people: { id: string; name: string; type: string }[];
  defaultScope: Scope;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    name: "", description: "", category: "programs", unit: "number",
    target: "", direction: "up", frequency: "monthly",
    ownerId: defaultScope === "mine" ? "" : "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    setError(null);
    const payload = { ...form };
    if (!payload.ownerId) {
      delete (payload as Record<string, unknown>).ownerId; // absent → personal goal
    }
    try {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const detail = await res.text();
        throw new Error(`Save failed (${res.status}) ${detail.slice(0, 120)}`);
      }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong saving this goal.");
    } finally {
      setSaving(false);
    }
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
          <div className="eyebrow !text-[9.5px] mb-1.5">Owned by</div>
          <select value={form.ownerId} onChange={(e) => set("ownerId", e.target.value)} className={inputCls}>
            <option value="">Me (personal)</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>{p.name}{p.type === "staff" ? "" : ` (${p.type})`}</option>
            ))}
          </select>
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
            <option value="yearly">yearly</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <div className="eyebrow !text-[9.5px] mb-1.5">Direction</div>
          <select value={form.direction} onChange={(e) => set("direction", e.target.value)} className={inputCls}>
            <option value="up">higher is better</option>
            <option value="down">lower is better</option>
          </select>
        </div>
      </div>
      <div className="flex gap-2 items-center">
        <Button variant="primary" onClick={save} disabled={saving}>Create Goal</Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        {error && <span className="text-[12px] text-[var(--down)]">{error}</span>}
      </div>
    </div>
  );
}
