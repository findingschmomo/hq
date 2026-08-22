"use client";

import { useCallback, useEffect, useState } from "react";
import { Inbox, Plus, Trash2, MailOpen } from "lucide-react";
import { Button, EmptyState, Pill, Skeleton, rise } from "@/components/ui/kit";

interface EmailItem {
  id: string;
  subject: string;
  senderName?: string | null;
  senderEmail?: string | null;
  category: string;
  priority: string;
  status: string;
  summary?: string | null;
  actionNote?: string | null;
  dueDate?: string | null;
  assignedTo?: string | null;
  notes?: string | null;
  receivedAt: string;
}

const STATUS_TABS = [
  { id: "triage", label: "Needs Triage" },
  { id: "in_progress", label: "In Progress" },
  { id: "waiting", label: "Waiting" },
  { id: "done", label: "Done" },
];

const CATEGORIES = ["general", "board", "staff", "funder", "partner", "resident", "press", "facilities", "finance"];
const PRIORITIES = ["high", "medium", "low"];

const priorityTone: Record<string, "down" | "warn" | "neutral"> = {
  high: "down",
  medium: "warn",
  low: "neutral",
};

export default function EmailTriagePage() {
  const [emails, setEmails] = useState<EmailItem[]>([]);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [tab, setTab] = useState("triage");
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchEmails = useCallback(async () => {
    try {
      const res = await fetch(`/api/email-triage?status=${tab}`);
      const data = await res.json();
      setEmails(data.emails || []);
      if (data.statusCounts) setStatusCounts(data.statusCounts);
    } catch {
      console.error("Failed to fetch emails");
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    setLoading(true);
    fetchEmails();
  }, [fetchEmails]);

  async function patch(id: string, updates: Record<string, unknown>) {
    await fetch("/api/email-triage", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...updates }),
    });
    fetchEmails();
  }

  async function remove(id: string) {
    await fetch("/api/email-triage", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    fetchEmails();
  }

  return (
    <div className="relative z-10 w-full mx-auto pt-4 pb-16">
      {/* Header */}
      <div className="hq-rise flex flex-wrap justify-between items-end gap-4 mb-8" style={rise(0)}>
        <div>
          <div className="eyebrow mb-2">Communication Control</div>
          <h1 className="text-[32px] font-semibold tracking-[-0.025em] leading-none text-[var(--text)]">Email Triage</h1>
        </div>
        <Button variant="primary" onClick={() => setShowAdd(true)}>
          <Plus className="w-3.5 h-3.5" /> Log Email
        </Button>
      </div>

      {/* Status tabs */}
      <div className="hq-rise flex gap-1.5 mb-6 overflow-x-auto pb-1" style={rise(1)}>
        {STATUS_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3.5 py-2 rounded-[10px] text-[12.5px] font-medium whitespace-nowrap transition-all border ${
              tab === t.id
                ? "bg-[var(--surface-2)] text-[var(--text)] border-[var(--line-strong)]"
                : "text-[var(--text-3)] hover:text-[var(--text-2)] border-transparent hover:bg-[var(--surface-1)]"
            }`}
          >
            {t.label}
            <span className="num ml-1.5 text-[11px] text-[var(--text-4)]">{statusCounts[t.id] || 0}</span>
          </button>
        ))}
      </div>

      {/* Add form */}
      {showAdd && (
        <AddEmailForm
          onDone={() => {
            setShowAdd(false);
            fetchEmails();
          }}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="panel p-5"><Skeleton className="h-4 w-2/3 mb-3" /><Skeleton className="h-3 w-1/3" /></div>
          ))}
        </div>
      ) : emails.length === 0 ? (
        <EmptyState
          icon={<Inbox className="w-8 h-8" />}
          title={tab === "triage" ? "Inbox zero — nothing needs triage" : "Nothing here"}
          hint="Log an email to start tracking it."
          action={<Button variant="primary" onClick={() => setShowAdd(true)}>Log Email</Button>}
        />
      ) : (
        <div className="space-y-3">
          {emails.map((email, i) => (
            <EmailCard
              key={email.id}
              email={email}
              open={expanded === email.id}
              onToggle={() => setExpanded(expanded === email.id ? null : email.id)}
              onPatch={(u) => patch(email.id, u)}
              onRemove={() => remove(email.id)}
              delay={i + 2}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EmailCard({
  email,
  open,
  onToggle,
  onPatch,
  onRemove,
  delay,
}: {
  email: EmailItem;
  open: boolean;
  onToggle: () => void;
  onPatch: (updates: Record<string, unknown>) => void;
  onRemove: () => void;
  delay: number;
}) {
  const overdue = email.dueDate && new Date(email.dueDate) < new Date() && email.status !== "done";
  return (
    <div className="hq-rise panel p-5 transition-colors hover:border-[var(--line-strong)]" style={rise(delay)}>
      <div className="flex items-start gap-3 cursor-pointer" onClick={onToggle}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <Pill tone={priorityTone[email.priority] || "neutral"}>{email.priority}</Pill>
            <span className="text-[11px] text-[var(--text-3)] uppercase tracking-wide">{email.category}</span>
            {overdue && <Pill tone="down">overdue</Pill>}
          </div>
          <p className="text-[14px] font-medium text-[var(--text)] leading-snug">{email.subject}</p>
          <p className="text-[12px] text-[var(--text-3)] mt-1">
            {email.senderName || email.senderEmail || "Unknown sender"}
            {" · "}
            {timeAgo(email.receivedAt)}
            {email.actionNote && <span className="text-[var(--text-2)]"> · {email.actionNote}</span>}
          </p>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onPatch({ status: "done" }); }}
          className="shrink-0 p-2 rounded-lg text-[var(--text-3)] hover:text-[var(--up)] hover:bg-[var(--surface-1)] transition-colors"
          title="Mark done"
        >
          <MailOpen className="w-4 h-4" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="shrink-0 p-2 rounded-lg text-[var(--text-3)] hover:text-[var(--down)] hover:bg-[var(--surface-1)] transition-colors"
          title="Delete"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {open && (
        <div className="mt-4 pt-4 border-t border-[var(--line)] grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Status">
            <select value={email.status} onChange={(e) => onPatch({ status: e.target.value })} className={inputCls}>
              {STATUS_TABS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              <option value="archived">Archived</option>
            </select>
          </Field>
          <Field label="Priority">
            <select value={email.priority} onChange={(e) => onPatch({ priority: e.target.value })} className={inputCls}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Category">
            <select value={email.category} onChange={(e) => onPatch({ category: e.target.value })} className={inputCls}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Due date">
            <input type="date" defaultValue={email.dueDate?.slice(0, 10) || ""} onChange={(e) => onPatch({ dueDate: e.target.value || null })} className={inputCls} />
          </Field>
          <Field label="Next action">
            <input defaultValue={email.actionNote || ""} placeholder="e.g. Reply with program dates" onBlur={(e) => onPatch({ actionNote: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Assigned to">
            <input defaultValue={email.assignedTo || ""} placeholder="Staff member" onBlur={(e) => onPatch({ assignedTo: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Summary / notes" full>
            <textarea defaultValue={email.summary || ""} rows={3} placeholder="What is this about?" onBlur={(e) => onPatch({ summary: e.target.value })} className={inputCls} />
          </Field>
        </div>
      )}
    </div>
  );
}

const inputCls =
  "w-full bg-[var(--surface-1)] border border-[var(--line)] text-[var(--text)] placeholder-[var(--text-4)] rounded-[var(--r-sm)] px-3 py-2 text-[13px] focus:outline-none focus:border-[var(--line-strong)]";

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <div className="eyebrow !text-[9.5px] mb-1.5">{label}</div>
      {children}
    </div>
  );
}

function AddEmailForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [form, setForm] = useState({
    subject: "", senderName: "", category: "general", priority: "medium", actionNote: "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    if (!form.subject.trim()) return;
    setSaving(true);
    await fetch("/api/email-triage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    }).catch(() => {});
    setSaving(false);
    onDone();
  }

  return (
    <div className="hq-rise elevated p-5 mb-6" style={rise(2)}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <div className="sm:col-span-2">
          <div className="eyebrow !text-[9.5px] mb-1.5">Subject</div>
          <input autoFocus value={form.subject} onChange={(e) => set("subject", e.target.value)} placeholder="What is the email about?" className={inputCls} />
        </div>
        <div>
          <div className="eyebrow !text-[9.5px] mb-1.5">Sender</div>
          <input value={form.senderName} onChange={(e) => set("senderName", e.target.value)} placeholder="Name or email" className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="eyebrow !text-[9.5px] mb-1.5">Category</div>
            <select value={form.category} onChange={(e) => set("category", e.target.value)} className={inputCls}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <div className="eyebrow !text-[9.5px] mb-1.5">Priority</div>
            <select value={form.priority} onChange={(e) => set("priority", e.target.value)} className={inputCls}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>
        <div className="sm:col-span-2">
          <div className="eyebrow !text-[9.5px] mb-1.5">Next action</div>
          <input value={form.actionNote} onChange={(e) => set("actionNote", e.target.value)} placeholder="e.g. Reply by Friday" className={inputCls} onKeyDown={(e) => e.key === "Enter" && save()} />
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="primary" onClick={save} disabled={saving}>Save</Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
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
