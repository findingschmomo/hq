"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar, Check, ChevronDown, Flag, Mail, UserPlus, Users, X } from "lucide-react";
import { Button, Pill, rise } from "@/components/ui/kit";

interface Delegatee {
  id: string;
  name: string;
  organization?: string | null;
}

interface Task {
  id: string;
  name: string;
  status: string;
  priority: string;
  category: string;
  dueDate?: string;
  delegatee?: Delegatee | null;
  blockedReason?: string | null;
  sourceEmail?: { gmailId?: string | null; subject?: string | null } | null;
}

const columns = [
  { id: "Not started", label: "To Do" },
  { id: "In progress", label: "In Progress" },
  { id: "Blocked", label: "Blocked" },
  { id: "Done", label: "Done" },
];

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [people, setPeople] = useState<Delegatee[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTask, setNewTask] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState("Medium");
  const [newTaskDueDate, setNewTaskDueDate] = useState("");
  const [showAddTask, setShowAddTask] = useState(false);
  const [addError, setAddError] = useState("");

  useEffect(() => {
    fetchTasks();
    fetch("/api/people")
      .then((r) => r.json())
      .then((d) => setPeople((d.stakeholders || []).map((s: { id: string; name: string; organization?: string }) => ({ id: s.id, name: s.name, organization: s.organization }))))
      .catch(() => {});
  }, []);

  async function fetchTasks() {
    try {
      const res = await fetch("/api/tasks");
      const data = await res.json();
      setTasks(data.tasks || []);
    } catch (e) {
      console.error("Failed to fetch tasks", e);
    } finally {
      setLoading(false);
    }
  }

  async function addTask() {
    const name = newTask.trim();
    if (!name) return;
    setAddError("");
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          status: "Not started",
          priority: newTaskPriority,
          dueDate: newTaskDueDate ? new Date(newTaskDueDate).toISOString() : null,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setNewTask("");
      setNewTaskPriority("Medium");
      setNewTaskDueDate("");
      setShowAddTask(false);
      fetchTasks();
    } catch (e) {
      console.error("Failed to add task", e);
      setAddError("Couldn't add the task — please try again.");
    }
  }

  async function updateTaskStatus(taskId: string, newStatus: string) {
    try {
      await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: taskId, status: newStatus }),
      });
      fetchTasks();
    } catch (e) {
      console.error("Failed to update task", e);
    }
  }

  async function patchTask(taskId: string, fields: Record<string, unknown>) {
    try {
      await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: taskId, ...fields }),
      });
      fetchTasks();
    } catch (e) {
      console.error("Failed to update task", e);
    }
  }

  async function updateTaskPriority(taskId: string, priority: string) {
    await patchTask(taskId, { priority });
  }

  async function updateTaskDueDate(taskId: string, dueDate: string | null) {
    await patchTask(taskId, { dueDate: dueDate ? new Date(dueDate).toISOString() : null });
  }

  async function deleteTask(taskId: string) {
    if (!window.confirm("Delete this task? This cannot be undone.")) return;
    try {
      await fetch("/api/tasks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: taskId }),
      });
      fetchTasks();
    } catch (e) {
      console.error("Failed to delete task", e);
    }
  }

  async function handleDelegate(taskId: string, delegateeId: string) {
    if (delegateeId === "__team__") {
      if (!window.confirm("Create a copy of this task for every direct report?")) return;
      try {
        await fetch("/api/tasks/delegate-team", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId }),
        });
      } catch (e) {
        console.error("Failed to delegate to team", e);
      }
    } else {
      await patchTask(taskId, { delegateeId: delegateeId || null });
    }
    fetchTasks();
  }

  if (loading) {
    return (
      <>
        <div className="relative z-10 w-full mx-auto pt-4">
          <div className="flex justify-between items-center mb-10">
            <div>
              <div className="sk h-3 w-20 mb-3" />
              <div className="sk h-7 w-28" />
            </div>
            <div className="sk h-9 w-28 rounded-full" />
          </div>
          <div className="grid grid-cols-4 gap-5">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="panel p-4">
                <div className="sk h-4 w-16 mb-4" />
                <div className="space-y-2">
                  {[...Array(i + 1)].map((_, j) => <div key={j} className="sk h-16 rounded-[var(--r-md)]" />)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="relative z-10 h-full flex flex-col w-full mx-auto pt-4 pb-16">
        <div className="hq-rise flex justify-between items-end gap-4 mb-10" style={rise(0)}>
          <div>
            <h1 className="text-[32px] font-semibold tracking-[-0.025em] leading-none text-[var(--text)]">Tasks</h1>
          </div>
          <Button variant="primary" onClick={() => { setAddError(""); setShowAddTask(true); }}>+ Add Task</Button>
        </div>

        {showAddTask && (
          <div className="hq-rise elevated mb-8 p-5 space-y-3">
            <input
              type="text"
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              placeholder="What needs to be done?"
              className="w-full bg-[var(--surface-1)] border border-[var(--line)] text-[var(--text)] placeholder-[var(--text-3)] rounded-[var(--r-md)] px-4 py-3 text-[14px] focus:outline-none focus:border-[var(--line-strong)]"
              onKeyDown={(e) => e.key === "Enter" && addTask()}
              autoFocus
            />
            <div className="flex items-center gap-3 flex-wrap">
              <select
                value={newTaskPriority}
                onChange={(e) => setNewTaskPriority(e.target.value)}
                className="text-[12px] bg-[var(--surface-1)] text-[var(--text-2)] rounded-[var(--r-sm)] px-3 py-2 border border-[var(--line)] focus:outline-none focus:border-[var(--line-strong)]"
              >
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
              <input
                type="date"
                value={newTaskDueDate}
                onChange={(e) => setNewTaskDueDate(e.target.value)}
                className="text-[12px] bg-[var(--surface-1)] text-[var(--text-2)] rounded-[var(--r-sm)] px-3 py-2 border border-[var(--line)] focus:outline-none focus:border-[var(--line-strong)]"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="primary" onClick={addTask}>Add Task</Button>
              <Button variant="ghost" onClick={() => { setShowAddTask(false); setNewTask(""); setNewTaskPriority("Medium"); setNewTaskDueDate(""); setAddError(""); }}>Cancel</Button>
            </div>
            {addError && (
              <p className="text-[12px] font-medium" style={{ color: "var(--down)" }}>{addError}</p>
            )}
          </div>
        )}

        <div className="flex-1 grid grid-cols-4 gap-5 overflow-hidden">
          {columns.map((column, idx) => {
            // delegated tasks only live on the board while in To Do; afterwards
            // they're tracked on the delegatee's card (people/team pages)
            const columnTasks = tasks.filter(
              (t) => t.status === column.id && !(t.delegatee && t.status !== "Not started")
            );
            const count = columnTasks.length;
            return (
              <div key={column.id} className="hq-rise panel flex flex-col overflow-hidden" style={rise(idx + 1)}>
                <div className="px-4 py-3.5 flex items-center justify-between">
                  <span className="eyebrow">{column.label}</span>
                  <span className="num text-[11px] text-[var(--text-3)]">{count}</span>
                </div>
                <div className="rule" />
                <div className="flex-1 p-2.5 space-y-2 overflow-y-auto">
                  {columnTasks
                    .map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        done={column.id === "Done"}
                        people={people}
                        onStatusChange={(status) => updateTaskStatus(task.id, status)}
                        onDelegate={(delegateeId) => handleDelegate(task.id, delegateeId)}
                        onPriorityChange={(priority) => updateTaskPriority(task.id, priority)}
                        onDueDateChange={(dueDate) => updateTaskDueDate(task.id, dueDate)}
                        onBlockedReason={(reason) => patchTask(task.id, { blockedReason: reason })}
                        onDelete={() => deleteTask(task.id)}
                      />
                    ))}
                  {count === 0 && (
                    <p className="text-[var(--text-4)] text-[12.5px] text-center py-8">No tasks</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function TaskCard({
  task,
  done,
  people,
  onStatusChange,
  onDelegate,
  onPriorityChange,
  onDueDateChange,
  onBlockedReason,
  onDelete,
}: {
  task: Task;
  done?: boolean;
  people: Delegatee[];
  onStatusChange: (status: string) => void;
  onDelegate: (delegateeId: string) => void;
  onPriorityChange: (priority: string) => void;
  onDueDateChange: (dueDate: string | null) => void;
  onBlockedReason: (reason: string) => void;
  onDelete: () => void;
}) {
  const priorityTone: Record<string, "warn" | "neutral"> = {
    High: "warn",
    Medium: "neutral",
    Low: "neutral",
  };

  return (
    <div className="rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-1)] p-3.5 transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)] cursor-pointer group">
      <p className={`font-medium text-[13px] mb-3 leading-relaxed ${done ? "text-[var(--text-3)] line-through" : "text-[var(--text)]"}`}>
        {task.name}
      </p>
      {task.status === "Blocked" && (
        <div className="mb-3">
          <BlockedReasonField
            initial={task.blockedReason || ""}
            onSave={onBlockedReason}
          />
        </div>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        {task.priority && (
          <Pill tone={priorityTone[task.priority] || "neutral"}>{task.priority}</Pill>
        )}
        {task.category && (
          <span className="text-[11px] text-[var(--text-3)]">{task.category}</span>
        )}
        {task.sourceEmail?.gmailId && (
          <a
            href={`https://mail.google.com/mail/u/0/#all/${task.sourceEmail.gmailId}`}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-[11px] text-[var(--text-3)] hover:text-[var(--accent)] transition-colors"
            title={`From email: ${task.sourceEmail.subject || ""}`}
          >
            <Mail className="w-3 h-3" /> source email
          </a>
        )}
      </div>
      <div className="mt-3 pt-3 border-t border-[var(--line)] space-y-2">
<select
            className="text-[12px] bg-[var(--surface-1)] text-[var(--text-2)] rounded-[var(--r-sm)] px-3 py-2 w-full border border-[var(--line)] focus:outline-none focus:border-[var(--line-strong)]"
            value={task.status}
            onChange={(e) => { e.stopPropagation(); onStatusChange(e.target.value); }}
          >
          {columns.map((col) => (
            <option key={col.id} value={col.id}>
              Move to {col.label}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-2 flex-wrap">
          <PriorityPicker value={task.priority} onChange={onPriorityChange} />
          <DueDatePicker value={task.dueDate} onChange={onDueDateChange} />
          <DelegatePicker
            people={people}
            current={task.delegatee}
            onSelect={onDelegate}
            onTeam={() => onDelegate("__team__")}
          />
          <button
            type="button"
            onClick={onDelete}
            title="Delete task"
            className="shrink-0 text-[11px] font-medium px-2.5 py-1.5 rounded-full border border-[var(--line)] text-[#b3564d] hover:bg-[var(--surface-2)] hover:border-[#b3564d] transition-colors cursor-pointer ml-auto"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

const PRIORITIES = ["High", "Medium", "Low"];

/* Popover positioning must escape transformed ancestors: the board columns keep
   a fill-mode transform (hq-rise), which turns them into the containing block
   for position:fixed and clips/misplaces any in-tree popover. Menus therefore
   portal to <body> and compute their viewport position synchronously on open. */

type MenuPos = { left: number } & ({ top: number } | { bottom: number });

function useMenu() {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const open = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const openUp = window.innerHeight - r.bottom < 260 && r.top > 260;
    setPos({
      left: Math.max(8, Math.min(r.left, window.innerWidth - 232)),
      ...(openUp ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }),
    });
  };
  const close = () => setPos(null);
  const toggle = () => (pos ? close() : open());
  return { btnRef, pos, open, close, toggle, isOpen: pos !== null };
}

function PopoverMenu({
  pos,
  onClose,
  children,
}: {
  pos: MenuPos | null;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!pos) return null;
  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        style={{ position: "fixed", ...pos }}
        className="z-50 w-56 bg-[var(--surface-1)] border border-[var(--line-strong)] rounded-[var(--r-md)] shadow-xl overflow-hidden"
      >
        {children}
      </div>
    </>,
    document.body
  );
}

function PriorityPicker({ value, onChange }: { value: string; onChange: (priority: string) => void }) {
  const { btnRef, pos, toggle, close, isOpen } = useMenu();
  const tone = value === "High" ? "warn" : "neutral";

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        title="Set priority"
        onClick={toggle}
        className="cursor-pointer"
      >
        <Pill tone={tone} className="transition-transform">
          <Flag className="w-3 h-3" />
          {value || "Priority"}
          <ChevronDown className={`w-3 h-3 opacity-60 transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </Pill>
      </button>
      <PopoverMenu pos={pos} onClose={close}>
        {PRIORITIES.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => { onChange(p); close(); }}
            className={`w-full flex items-center justify-between px-3 py-2 text-left text-[12px] hover:bg-[var(--surface-2)] transition-colors cursor-pointer ${
              p === value ? "font-semibold text-[var(--accent)]" : "text-[var(--text-2)]"
            }`}
          >
            <span className="inline-flex items-center gap-2">
              <Flag className={`w-3 h-3 ${p === "High" ? "text-[var(--warn)]" : "opacity-50"}`} />
              {p}
            </span>
            {p === value && <Check className="w-3.5 h-3.5" />}
          </button>
        ))}
      </PopoverMenu>
    </>
  );
}

function DueDatePicker({
  value,
  onChange,
}: {
  value?: string;
  onChange: (iso: string | null) => void;
}) {
  const dateValue = typeof value === "string" && value.includes("T") ? value.slice(0, 10) : "";
  return (
    <div
      className="inline-flex items-center gap-1 rounded-full border px-2.5 py-[4px] text-[11px] font-medium text-[var(--text-2)]"
      style={{
        background: "color-mix(in srgb, var(--text-3) 12%, transparent)",
        borderColor: dateValue ? "color-mix(in srgb, var(--accent) 30%, transparent)" : "color-mix(in srgb, var(--text-3) 22%, transparent)",
      }}
    >
      <Calendar className="w-3 h-3 shrink-0 pointer-events-none opacity-70" />
      <input
        type="date"
        value={dateValue}
        onChange={(e) => onChange(e.target.value || null)}
        aria-label="Due date"
        title={dateValue ? "Change due date" : "Add due date"}
        className="bg-transparent border-0 p-0 text-[11px] font-medium text-current focus:outline-none w-[94px] cursor-pointer"
      />
      {dateValue && (
        <button
          type="button"
          title="Clear due date"
          aria-label="Clear due date"
          onClick={() => onChange(null)}
          className="shrink-0 cursor-pointer text-current opacity-70 hover:text-[var(--warn)] hover:opacity-100 transition-colors"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

function DelegatePicker({
  people,
  current,
  onSelect,
  onTeam,
}: {
  people: Delegatee[];
  current?: Delegatee | null;
  onSelect: (personId: string) => void;
  onTeam: () => void;
}) {
  const [query, setQuery] = useState("");
  const { btnRef, pos, open, close, isOpen } = useMenu();
  const q = query.trim().toLowerCase();
  const filtered = q
    ? people.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.organization ?? "").toLowerCase().includes(q)
      )
    : people;

  return (
    <div className="relative flex-1 min-w-[140px] max-w-[200px]">
      <button
        ref={btnRef}
        type="button"
        title="Delegate this task"
        onClick={() => { setQuery(""); if (isOpen) close(); else open(); }}
        className={`w-full inline-flex items-center gap-1.5 truncate rounded-full border px-2.5 py-[5px] text-[11px] font-medium transition-colors cursor-pointer hover:border-[var(--line-strong)] ${
          current ? "text-[var(--accent)]" : "text-[var(--text-2)]"
        }`}
        style={{
          background: current
            ? "color-mix(in srgb, var(--accent) 12%, transparent)"
            : "color-mix(in srgb, var(--text-3) 12%, transparent)",
          borderColor: current
            ? "color-mix(in srgb, var(--accent) 22%, transparent)"
            : "color-mix(in srgb, var(--text-3) 22%, transparent)",
        }}
      >
        {current ? (
          <>
            <UserPlus className="w-3 h-3 shrink-0" />
            <span className="truncate">→ {current.name}</span>
          </>
        ) : (
          <>
            <UserPlus className="w-3 h-3 shrink-0 opacity-70" />
            <span className="truncate opacity-80">Delegate…</span>
          </>
        )}
      </button>
      <PopoverMenu pos={pos} onClose={close}>
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && close()}
            placeholder="Search people…"
            className="w-full bg-transparent px-3 py-2.5 text-[12px] text-[var(--text)] placeholder-[var(--text-4)] border-b border-[var(--line)] focus:outline-none"
          />
          <div className="max-h-44 overflow-y-auto">
            {filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => { onSelect(p.id); close(); }}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-[12px] text-[var(--text-2)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
              >
                <span className="truncate">{p.name}</span>
                {current?.id === p.id ? (
                  <Check className="w-3.5 h-3.5 shrink-0 text-[var(--accent)]" />
                ) : (
                  p.organization && <span className="text-[10.5px] text-[var(--text-4)] truncate">{p.organization}</span>
                )}
              </button>
            ))}
            {!filtered.length && (
              <div className="px-3 py-2.5 text-[12px] text-[var(--text-4)]">No matches</div>
            )}
          </div>
          <div className="border-t border-[var(--line)]">
            {current && (
              <button
                type="button"
                onClick={() => { onSelect(""); close(); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-[12px] text-[#b3564d] hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
              >
                <X className="w-3 h-3" /> Unassign
              </button>
            )}
            <button
              type="button"
              onClick={onTeam}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-[12px] font-semibold text-[var(--accent)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
            >
              <Users className="w-3 h-3" /> Delegate to my team
            </button>
          </div>
      </PopoverMenu>
    </div>
  );
}

function BlockedReasonField({ initial, onSave }: { initial: string; onSave: (reason: string) => void }) {
  const [value, setValue] = useState(initial);
  const dirty = value !== initial;

  return (
    <div className="bg-[var(--surface-2)] border border-[var(--line)] rounded-[var(--r-sm)] p-2.5">
      {!initial && !dirty && (
        <p className="text-[11px] font-medium mb-1.5" style={{ color: "var(--warn)" }}>
          What&apos;s blocking this?
        </p>
      )}
      <textarea
        rows={2}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="e.g. waiting on Robin to send the venue contract…"
        className="w-full bg-transparent text-[12px] text-[var(--text-2)] placeholder-[var(--text-4)] resize-none focus:outline-none leading-relaxed"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (dirty) onSave(value);
          }
        }}
      />
      {dirty && (
        <div className="flex justify-end mt-1">
          <Button variant="primary" size="sm" onClick={() => onSave(value)}>Save</Button>
        </div>
      )}
    </div>
  );
}
