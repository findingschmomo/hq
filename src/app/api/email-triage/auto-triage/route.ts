import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* Henrietta-powered inbox pipeline.
   start: queue the first BATCH of untriaged emails as an `oneshot`
          AgentRequest. The bridge runs it via OpenCode.
   check: applies the finished batch (classify emails AND move them out of
          `triage`, extract Tasks, upsert Stakeholder contacts, accumulate a
          bucketed Inbox Digest) then dispatches the next one.
   autorun: once started, a background loop keeps doing check's job until the
          backlog is empty — no open tab required. */

const TRIAGE_TITLE_PREFIX = "Triage inbox";
const PIPELINE_KEY = "email-triage:pipeline";
const DIGEST_KEY = "email-triage:digest";

const BUCKETS = ["general", "board", "staff", "funder", "partner", "resident", "press", "facilities", "finance"];
const PRIORITIES = ["high", "medium", "low"];
const STAKEHOLDER_TYPES = ["staff", "board", "funder", "partner", "resident", "government", "vendor", "other"];

const BATCH_SIZE = 12;
/** Addresses owned by the ED — self-sent mail must never become a Stakeholder contact. */
const SELF_EMAIL_FALLBACKS = ["henriettaobsidian@gmail.com"];

interface Pipeline {
  totalEmails: number;
  totalBatches: number;
  currentBatch: number;
  processed: number;
  tasksCreated: number;
  stakeholdersNew: number;
  requestId: string | null;
  retries?: number;
}

interface Entry {
  id?: string;
  bucket?: string;
  priority?: string;
  status?: string;
  summary?: string;
  actionNote?: string;
  dueDate?: string | null;
  task?: { name?: string; notes?: string; dueDate?: string | null; priority?: string } | null;
  contact?: { name?: string; email?: string; organization?: string; title?: string; type?: string } | null;
}

interface DigestItem {
  bucket: string;
  subject: string;
  from: string;
  summary: string;
}
interface DigestData {
  updatedAt?: string;
  items: DigestItem[];
}

async function getSelfEmails(): Promise<string[]> {
  const row = await prisma.dataStore.findUnique({ where: { key: "gmail-oauth" } });
  const connected = (row?.data as unknown as { email?: string } | null)?.email?.trim().toLowerCase();
  return connected ? [...new Set([...SELF_EMAIL_FALLBACKS, connected])] : SELF_EMAIL_FALLBACKS;
}

function buildPrompt(
  emails: { id: string; senderName: string | null; senderEmail: string | null; subject: string; receivedAt: Date; summary?: string | null }[],
): string {
  const list = emails
    .map((e) => {
      const context = (e.summary ?? "").replace(/\s+/g, " ").slice(0, 400);
      return [
        `#id:${e.id}`,
        `From: ${e.senderName ?? "unknown"}${e.senderEmail ? ` <${e.senderEmail}>` : ""}`,
        `Subject: ${e.subject}`,
        `Received: ${e.receivedAt.toISOString().slice(0, 10)}`,
        `Content: ${context}`,
      ].join(" | ");
    })
    .join("\n---\n");

  return [
    "You are the chief of staff for the executive director of Heights Philadelphia, a community nonprofit in Philadelphia.",
    "Process each email below. Do NOT use any tools or browse anything — answer directly from the given text.",
    "",
    "For EVERY item return exactly these fields:",
    "- id: copy the #id value unchanged",
    `- bucket: one of ${BUCKETS.join(", ")}`,
    `- priority: one of ${PRIORITIES.join(", ")} (high = board/funders/time-sensitive money or people matters)`,
    '- status: "in_progress" if a human must act (reply, decide, schedule, approve); "done" if purely informational',
    "- summary: one plain sentence capturing the gist",
    "- actionNote: short imperative next step (empty string if none)",
    '- dueDate: "YYYY-MM-DD" if the email names a real deadline, else null',
    "- task: null, or an object for a concrete task worth tracking:",
    '     {"name":"imperative title","notes":"context incl. who/what","dueDate":"YYYY-MM-DD"|null,"priority":"high|medium|low"}',
    "- contact: null, or an object when the sender is an identifiable person/org worth remembering:",
    '     {"name":"person name","email":"sender email","organization":"their org","title":"role if evident","type":"board|staff|funder|partner|resident|government|vendor|other"}',
    "",
    "Be conservative: omit task/contact rather than inventing details.",
    "Respond with ONLY a raw JSON array — no prose, no markdown fences:",
    '[{"id":"...","bucket":"...","priority":"...","status":"...","summary":"...","actionNote":"...","dueDate":null,"task":null,"contact":null}]',
    "",
    "EMAILS:",
    list,
  ].join("\n");
}

async function getPipeline(): Promise<Pipeline> {
  const row = await prisma.dataStore.findUnique({ where: { key: PIPELINE_KEY } });
  return (
    (row?.data as unknown as Pipeline) ?? {
      totalEmails: 0,
      totalBatches: 0,
      currentBatch: 0,
      processed: 0,
      tasksCreated: 0,
      stakeholdersNew: 0,
      requestId: null,
    }
  );
}

function savePipeline(p: Pipeline) {
  const data = p as unknown as Prisma.InputJsonValue;
  return prisma.dataStore.upsert({ where: { key: PIPELINE_KEY }, update: { data }, create: { key: PIPELINE_KEY, data } });
}

async function dispatchBatch(batchIndex: number, p: Pipeline): Promise<string> {
  const untriaged = await prisma.emailItem.findMany({
    where: { status: "triage" },
    orderBy: { receivedAt: "desc" },
    take: BATCH_SIZE,
  });
  if (untriaged.length === 0) return "";

  const request = await prisma.agentRequest.create({
    data: {
      origin: "web",
      kind: "oneshot",
      title: `${TRIAGE_TITLE_PREFIX} batch ${batchIndex}/${p.totalBatches} (${untriaged.length})`,
      prompt: buildPrompt(untriaged),
      sideEffecting: false,
      status: "queued",
    },
  });
  p.requestId = request.id;
  await savePipeline(p);
  return request.id;
}

/** Recovers a truncated "[{...}, {" array by closing it after the last complete element. */
function salvageJsonArray(text: string): string | null {
  let depth = 0;
  let inStr = false;
  let esc = false;
  let lastComplete = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") {
      depth--;
      if (depth === 1) lastComplete = i;
      if (depth === 0) return text;
    }
  }
  return lastComplete > 0 ? text.slice(0, lastComplete + 1) + "]" : null;
}

/* Applies the current batch once its AgentRequest finishes, then either
   dispatches the next one or closes out the pipeline. Shared by the HTTP
   check action and the background autorun loop. */
let applyingNow = false;

async function applyCurrentBatch(): Promise<Record<string, unknown>> {
  if (applyingNow) return { state: "running" };
  applyingNow = true;
  try {
    const pipeline = await getPipeline();
    if (!pipeline.requestId || pipeline.currentBatch === 0 || pipeline.currentBatch > pipeline.totalBatches) {
      return { state: "idle" };
    }
    const latest = await prisma.agentRequest.findUnique({ where: { id: pipeline.requestId } });
    if (!latest) return { state: "idle" };
    if (latest.status === "failed" || latest.status === "rejected") {
      // transient bridge/model failure: re-dispatch the same batch (up to 3 consecutive tries)
      if ((pipeline.retries ?? 0) < 3) {
        pipeline.retries = (pipeline.retries ?? 0) + 1;
        await savePipeline(pipeline);
        await dispatchBatch(pipeline.currentBatch, pipeline);
        return { state: "running", batch: { current: pipeline.currentBatch, total: pipeline.totalBatches }, retried: true };
      }
      return { state: "failed", error: latest.error, batch: { current: pipeline.currentBatch, total: pipeline.totalBatches } };
    }
    if (latest.status !== "done") {
      return {
        state: latest.status,
        error: latest.error,
        batch: { current: pipeline.currentBatch, total: pipeline.totalBatches },
        processed: pipeline.processed,
        totalEmails: pipeline.totalEmails,
      };
    }

    // ── parse ──
    let entries: Entry[];
    try {
      const text = latest.result ?? "";
      const startIdx = text.indexOf("[");
      const endIdx = text.lastIndexOf("]");
      if (startIdx === -1) throw new Error("no JSON array in result");
      const candidate = endIdx > startIdx ? text.slice(startIdx, endIdx + 1) : salvageJsonArray(text.slice(startIdx));
      if (!candidate) throw new Error("result truncated before any complete entry");
      entries = JSON.parse(candidate);
      if (!Array.isArray(entries)) throw new Error("not an array");
    } catch (e) {
      return { state: "parse_error", detail: e instanceof Error ? e.message : "unparsable result" };
    }

    // ── apply ──
    let updated = 0;
    const selfEmails = await getSelfEmails();
    for (const entry of entries) {
      const id = typeof entry.id === "string" ? entry.id : "";
      if (!id) continue;

      const category = BUCKETS.includes(String(entry.bucket)) ? String(entry.bucket) : null;
      const priority = PRIORITIES.includes(String(entry.priority)) ? String(entry.priority) : null;
      const status = entry.status === "done" ? "done" : "in_progress";
      const summary = typeof entry.summary === "string" && entry.summary.trim() ? entry.summary.trim().slice(0, 1000) : null;
      const actionNote =
        typeof entry.actionNote === "string" && entry.actionNote.trim() ? entry.actionNote.trim().slice(0, 500) : null;
      let dueDate: Date | null = null;
      if (typeof entry.dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(entry.dueDate)) {
        dueDate = new Date(`${entry.dueDate}T12:00:00`);
        if (isNaN(dueDate.getTime())) dueDate = null;
      }

      const email = await prisma.emailItem
        .update({
          where: { id },
          data: {
            ...(category && { category }),
            ...(priority && { priority }),
            ...(summary && { summary }),
            ...(actionNote ? { actionNote } : {}),
            dueDate,
            status,
          },
        })
        .catch(() => null);
      if (!email) continue;
      updated++;

      // ── digest accumulation ──
      const digestRow = await prisma.dataStore.findUnique({ where: { key: DIGEST_KEY } });
      const digest = (digestRow?.data as unknown as DigestData) ?? { items: [] };
      digest.items.unshift({
        bucket: email.category,
        subject: email.subject.slice(0, 140),
        from: (email.senderName || email.senderEmail || "unknown").slice(0, 80),
        summary: (summary ?? "").slice(0, 220),
      });
      digest.items = digest.items.slice(0, 200);
      digest.updatedAt = new Date().toISOString();
      const digestJson = digest as unknown as Prisma.InputJsonValue;
      await prisma.dataStore.upsert({ where: { key: DIGEST_KEY }, update: { data: digestJson }, create: { key: DIGEST_KEY, data: digestJson } });

      // ── task extraction ──
      const t = entry.task;
      if (t && typeof t.name === "string" && t.name.trim()) {
        const name = t.name.trim().slice(0, 200);
        const dupe = await prisma.task.findFirst({
          where: { name, createdAt: { gte: new Date(Date.now() - 60 * 24 * 3600 * 1000) } },
        });
        if (!dupe) {
          let taskDue: Date | null = null;
          if (typeof t.dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(t.dueDate)) {
            taskDue = new Date(`${t.dueDate}T12:00:00`);
            if (isNaN(taskDue.getTime())) taskDue = null;
          }
          const prioRaw = String(t.priority ?? "medium").toLowerCase();
          const TASK_CATEGORY: Record<string, string> = {
            funder: "fundraising",
            finance: "admin",
            board: "admin",
            staff: "people",
            resident: "programs",
            facilities: "facilities",
          };
          await prisma.task.create({
            data: {
              name,
              category: TASK_CATEGORY[email.category] ?? "operations",
              priority: prioRaw === "high" ? "High" : prioRaw === "low" ? "Low" : "Medium",
              status: "Not started",
              dueDate: taskDue,
            },
          });
          pipeline.tasksCreated++;
        }
      }

      // ── stakeholder upsert ──
      const c = entry.contact;
      const cEmail = typeof c?.email === "string" ? c.email.trim().toLowerCase() : "";
      if (c && (cEmail || (typeof c.name === "string" && c.name.trim()))) {
        if (cEmail && selfEmails.includes(cEmail)) continue;
        const typeRaw = String(c.type ?? "other").toLowerCase();
        const stype = STAKEHOLDER_TYPES.includes(typeRaw) ? typeRaw : "other";
        const existing = cEmail
          ? await prisma.stakeholder.findFirst({ where: { email: { equals: cEmail, mode: "insensitive" } } })
          : await prisma.stakeholder.findFirst({ where: { name: { equals: String(c.name).trim(), mode: "insensitive" } } });
        if (existing) {
          await prisma.stakeholder.update({
            where: { id: existing.id },
            data: {
              lastContactAt: new Date(),
              organization: existing.organization ?? (typeof c.organization === "string" && c.organization.trim() ? c.organization.trim().slice(0, 200) : null),
              title: existing.title ?? (typeof c.title === "string" && c.title.trim() ? c.title.trim().slice(0, 120) : null),
            },
          });
        } else {
          await prisma.stakeholder.create({
            data: {
              name: (typeof c.name === "string" && c.name.trim() ? c.name.trim() : cEmail).slice(0, 160),
              email: cEmail || null,
              organization: typeof c.organization === "string" && c.organization.trim() ? c.organization.trim().slice(0, 200) : null,
              title: typeof c.title === "string" && c.title.trim() ? c.title.trim().slice(0, 120) : null,
              type: stype,
              notes: `Auto-added from inbox · ${email.subject.slice(0, 140)}`,
              lastContactAt: email.receivedAt,
            },
          });
          pipeline.stakeholdersNew++;
        }
      }
    }

    pipeline.processed += updated;
    pipeline.retries = 0;
    const remaining = await prisma.emailItem.count({ where: { status: "triage" } });
    if (remaining === 0) {
      await savePipeline({ ...pipeline, requestId: null, currentBatch: pipeline.totalBatches + 1 });
      return {
        state: "complete",
        batch: { current: pipeline.totalBatches, total: pipeline.totalBatches },
        processed: pipeline.processed,
        tasksCreated: pipeline.tasksCreated,
        stakeholdersNew: pipeline.stakeholdersNew,
      };
    }

    // ── dispatch the next batch and keep going ──
    pipeline.currentBatch += 1;
    await savePipeline(pipeline);
    await dispatchBatch(pipeline.currentBatch, pipeline);
    return {
      state: "applied_batch",
      batch: { current: pipeline.currentBatch - 1, total: pipeline.totalBatches },
      updated,
      processed: pipeline.processed,
      totalEmails: pipeline.processed + remaining,
      tasksCreated: pipeline.tasksCreated,
      stakeholdersNew: pipeline.stakeholdersNew,
    };
  } finally {
    applyingNow = false;
  }
}

const AUTORUN_POLL_MS = 20_000;
let autorunActive = false;

/** Keeps applying + dispatching batches until the backlog is empty, no browser needed. */
async function autorunLoop(): Promise<void> {
  if (autorunActive) return;
  autorunActive = true;
  try {
    for (;;) {
      await new Promise((r) => setTimeout(r, AUTORUN_POLL_MS));
      const pipeline = await getPipeline();
      if (!pipeline.requestId || pipeline.currentBatch > pipeline.totalBatches) break;
      const res = await applyCurrentBatch();
      const state = String(res.state ?? "");
      if (!["queued", "approved", "running", "applied_batch"].includes(state)) break;
    }
  } catch {
    // transient db/network error: leave state as-is; the next touch resumes it
  } finally {
    autorunActive = false;
  }
}

export async function POST(req: Request) {
  const { action } = await req.json().catch(() => ({ action: undefined }));

  if (action === "start") {
    const remaining = await prisma.emailItem.count({ where: { status: "triage" } });
    if (remaining === 0) {
      return NextResponse.json({ state: "nothing_to_triage" });
    }

    const inFlight = await prisma.agentRequest.findFirst({
      where: {
        title: { startsWith: TRIAGE_TITLE_PREFIX },
        status: { in: ["queued", "approved", "running"] },
      },
    });
    if (inFlight) {
      void autorunLoop();
      return NextResponse.json({ state: inFlight.status, requestId: inFlight.id });
    }

    const pipeline: Pipeline = {
      totalEmails: remaining,
      totalBatches: Math.ceil(remaining / BATCH_SIZE),
      currentBatch: 0,
      processed: 0,
      tasksCreated: 0,
      stakeholdersNew: 0,
      requestId: null,
    };
    await savePipeline(pipeline);
    pipeline.currentBatch = 1;
    await dispatchBatch(1, pipeline);
    void autorunLoop();
    return NextResponse.json({
      state: "queued",
      batch: { current: 1, total: pipeline.totalBatches },
      totalEmails: pipeline.totalEmails,
    });
  }

  if (action === "check") {
    return NextResponse.json(await applyCurrentBatch());
  }

  return NextResponse.json({ error: "action must be 'start' or 'check'" }, { status: 400 });
}

export async function GET() {
  void autorunLoop();
  const row = await prisma.dataStore.findUnique({ where: { key: DIGEST_KEY } });
  const digest = (row?.data as unknown as DigestData) ?? { items: [], updatedAt: null };
  const grouped: Record<string, DigestItem[]> = {};
  for (const item of digest.items) {
    (grouped[item.bucket] ||= []).push(item);
  }
  return NextResponse.json({ updatedAt: digest.updatedAt ?? null, grouped, count: digest.items.length });
}
