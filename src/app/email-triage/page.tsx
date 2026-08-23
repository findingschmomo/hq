"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Inbox, Plus, Trash2, MailOpen, Send, RefreshCw, Sparkles, Link2, Link2Off } from "lucide-react";
import { Button, EmptyState, Pill, Skeleton, rise } from "@/components/ui/kit";
import { AGENT_NAME } from "@/lib/agent-name";

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
  threadId?: string | null;
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

type TriageRunState = "idle" | "queued" | "approved" | "running" | "applied" | "parse_error" | "failed";

export default function EmailTriagePage() {
  const [emails, setEmails] = useState<EmailItem[]>([]);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [tab, setTab] = useState("triage");
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Gmail connection + actions
  const [google, setGoogle] = useState<{ connected: boolean; email: string | null }>({ connected: false, email: null });
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  // Hermes triage run
  const [runState, setRunState] = useState<TriageRunState>("idle");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const fetchGoogleStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/email-triage/google/status");
      setGoogle(await res.json());
    } catch {
      /* stays disconnected */
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchEmails();
  }, [fetchEmails]);

  useEffect(() => {
    fetchGoogleStatus();
  }, [fetchGoogleStatus]);

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
  }, []);

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

  async function syncGmail() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch("/api/email-triage/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setSyncMsg(data.needsConnect ? "Connect your Google account first." : data.error || "Sync failed.");
      } else {
        setSyncMsg(`Scanned ${data.scanned} · ${data.added} new`);
        fetchEmails();
      }
    } catch {
      setSyncMsg("Sync failed.");
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMsg(null), 6000);
    }
  }

  async function triageWithHermes() {
    if (pollRef.current) clearInterval(pollRef.current);
    try {
      const res = await fetch("/api/email-triage/auto-triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });
      const data = await res.json();

      if (data.state === "nothing_to_triage") {
        setSyncMsg("Nothing needs triage right now.");
        setTimeout(() => setSyncMsg(null), 4000);
        return;
      }
      if (["queued", "approved", "running"].includes(data.state)) {
        setRunState(data.state as TriageRunState);
        pollRef.current = setInterval(async () => {
          const check = await fetch("/api/email-triage/auto-triage", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "check" }),
          }).then((r) => r.json());

          if (check.state === "applied") {
            stopPoll(`${check.updated} emails triaged by ${AGENT_NAME}`);
            fetchEmails();
          } else if (check.state === "parse_error") {
            stopPoll(`${AGENT_NAME} replied in an unexpected format`);
          } else if (check.state === "failed" || check.state === "rejected") {
            stopPoll(`${AGENT_NAME} triage failed`);
          } else if (["queued", "approved", "running"].includes(check.state)) {
            setRunState(check.state);
          }
        }, 3000);
      }
    } catch {
      setSyncMsg(`Could not reach the ${AGENT_NAME} bus.`);
      setTimeout(() => setSyncMsg(null), 5000);
    }
  }

  function stopPoll(msg: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    setRunState("idle");
    setSyncMsg(msg);
    setTimeout(() => setSyncMsg(null), 6000);
  }

  async function disconnectGoogle() {
    await fetch("/api/email-triage/google/status", { method: "DELETE" });
    setGoogle({ connected: false, email: null });
  }

  const busy = ["queued", "approved", "running"].includes(runState);

  return (
    <div className="relative z-10 w-full mx-auto pt-4 pb-16">
      {/* Header */}
      <div className="hq-rise flex flex-wrap justify-between items-end gap-4 mb-6" style={rise(0)}>
        <div>
          <div className="eyebrow mb-2">Communication Control</div>
          <h1 className="text-[32px] font-semibold tracking-[-0.025em] leading-none text-[var(--text)]">Email Triage</h1>
        </div>
        <div className="flex flex-col items-end gap-2">
          {/* Gmail connection chip */}
          <div className="flex items-center gap-2">
            {google.connected ? (
              <>
                <Pill tone="up"><Link2 className="w-3 h-3" /> Gmail{google.email ? ` · ${google.email}` : ""}</Pill>
                <button onClick={disconnectGoogle} title="Disconnect Gmail"
                  className="p-1.5 rounded-lg text-[var(--text-4)] hover:text-[var(--down)] hover:bg-[var(--surface-1)] transition-colors">
                  <Link2Off className="w-3.5 h-3.5" />
                </button>
              </>
            ) : (
              <a href="/api/email-triage/google/connect" className="btn-ghost !py-1.5 !px-3 !text-[12px] inline-flex items-center gap-1.5">
                <Link2 className="w-3.5 h-3.5" /> Connect Google
              </a>
            )}
          </div>
          <div className="flex items-center gap-2">
            {syncMsg && <span className="text-[11.5px] num text-[var(--text-3)]">{syncMsg}</span>}
            <Button variant="ghost" size="sm" onClick={syncGmail} disabled={syncing || !google.connected}
              title={google.connected ? "Pull recent inbox mail" : "Connect Google first"}>
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} /> Sync
            </Button>
            <Button variant="primary" size="sm" onClick={triageWithHermes} disabled={busy}>
              <Sparkles className={`w-3.5 h-3.5 ${busy ? "animate-pulse" : ""}`} />
              {busy ? `${AGENT_NAME} ${runState}…` : `Triage with ${AGENT_NAME}`}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowAdd(true)}>
              <Plus className="w-3.5 h-3.5" /> Log
            </Button>
          </div>
        </div>
      </div>

      {!google.connected && (
        <div className="hq-rise panel p-4 mb-5 text-[12.5px] text-[var(--text-2)] leading-relaxed" style={rise(1)}>
          Connect your Google account to pull inbox mail automatically and reply from here.
          One-time consent for <span className="num">gmail.readonly</span> + <span className="num">gmail.send</span>.
          (Setup: enable the Gmail API in Google Cloud Console and add this site&apos;s callback URL.)
        </div>
      )}

      {/* Status tabs */}
      <div className="hq-rise flex gap-1.5 mb-6 overflow-x-auto pb-1" style={rise(2)}>
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
          hint="Sync from Gmail or log an email manually."
          action={google.connected
            ? <Button variant="primary" onClick={syncGmail}>Sync Gmail</Button>
            : <Button variant="primary" onClick={() => setShowAdd(true)}>Log Email</Button>}
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
              onSent={() => patch(email.id, {})}
              delay={i + 3}
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
  onSent,
  delay,
}: {
  email: EmailItem;
  open: boolean;
  onToggle: () => void;
  onPatch: (updates: Record<string, unknown>) => void;
  onRemove: () => void;
  onSent: () => void;
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
            {email.threadId && <span title="Synced from Gmail"><MailOpen className="w-3 h-3 text-[var(--text-4)]" /></span>}
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
        <div className="mt-4 pt-4 border-t border-[var(--line)] space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

          {email.senderEmail && <ReplyBox emailId={email.id} to={email.senderEmail} subject={email.subject} onSent={onSent} />}
        </div>
      )}
    </div>
  );
}

function ReplyBox({ emailId, to, subject, onSent }: { emailId: string; to: string; subject: string; onSent: () => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!text.trim()) return;
    if (!confirm(`Send reply to ${to}?`)) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/email-triage/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailId, to, subject, text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "send failed");
      setText("");
      setOpen(false);
      onSent();
    } catch (e) {
      setError(e instanceof Error ? e.message : "send failed");
    } finally {
      setSending(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-ghost !py-1.5 !px-3 !text-[12px] inline-flex items-center gap-1.5">
        <Send className="w-3.5 h-3.5" /> Reply
      </button>
    );
  }

  return (
    <div className="bg-[var(--surface-1)] border border-[var(--line)] rounded-[var(--r-md)] p-4 space-y-2">
      <div className="eyebrow !text-[9.5px]">Reply to {to} · Re: {subject}</div>
      <textarea autoFocus rows={4} value={text} onChange={(e) => setText(e.target.value)}
        placeholder={"Dear …\n\nBest,\n" + (process.env.NEXT_PUBLIC_OWNER_NAME || "")} className={inputCls} />
      {error && <p className="text-[11.5px]" style={{ color: "var(--down)" }}>{error}</p>}
      <div className="flex gap-2">
        <Button variant="primary" size="sm" onClick={send} disabled={sending}><Send className="w-3 h-3" /> Send</Button>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
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
    <div className="hq-rise elevated p-5 mb-6" style={rise(3)}>
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
