import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* Henrietta-powered inbox pipeline.
   start: queue the first BATCH of untriaged emails as an `oneshot`
          AgentRequest. The bridge runs it via OpenCode.
   check: poll the active batch; when done, parse the agent's JSON and apply
          it — classify emails AND move them out of `triage`, extract Tasks,
          upsert Stakeholder contacts, accumulate a bucketed Inbox Digest —
          then dispatch the next batch until none remain. */

const TRIAGE_TITLE_PREFIX = "Triage inbox";
const PIPELINE_KEY = "email-triage:pipeline";
const DIGEST_KEY = "email-triage:digest";

const BUCKETS = ["general", "board", "staff", "funder", "partner", "resident", "press", "facilities", "finance"];
const PRIORITIES = ["high", "medium", "low"];
const STAKEHOLDER_TYPES = ["staff", "board", "funder", "partner", "resident", "government", "vendor", "other"];

const BATCH_SIZE = 12;

interface Pipeline {
  totalEmails: number;
  totalBatches: number;
  currentBatch: number;
  processed: number;
  tasksCreated: number;
  stakeholdersNew: number;
  requestId: string | null;
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
      totalEmails: 0, totalBatches: 0, currentBatch: 0,
      processed: 0, tasksCreated: 0, stakeholdersNew: 0, requestId: null,
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

export async function POST(req: Request) {
  const { action } = await req.json().catch(() => ({ action: undefined }));

  if (action === "start") {
    const remaining = await prisma.emailItem.count({ where: { status: "triage" } });
    if (remaining === 0) {
      return NextResponse.json({ state: "nothing_to_triage" });
    }

    const inFlight = await prisma.agentRequest.findFirst({
      where: { title: { startsWith: TRIAGE_TITLE_PREFIX }, status: { in: ["queued", "approved", "running"] } },
    });
    if (inFlight) {
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
    return NextResponse.json({
      state: "queued",
      batch: { current: 1, total: pipeline.totalBatches },
      totalEmails: pipeline.totalEmails,
    });
  }

  if (action === "check") {
    const pipeline = await getPipeline();
    if (!pipeline.requestId || pipeline.currentBatch === 0 || pipeline.currentBatch > pipeline.totalBatches) {
      return NextResponse.json({ state: "idle" });
    }
    const latest = await prisma.agentRequest.findUnique({ where: { id: pipeline.requestId } });
    if (!latest) return NextResponse.json({ state: "idle" });
    if (latest.status !== "done") {
      return NextResponse.json({
        state: latest.status,
        error: latest.error,
        batch: { current: pipeline.currentBatch, total: pipeline.totalBatches },
        processed: pipeline.processed,
        totalEmails: pipeline.totalEmails,
      });
    }

    // ── parse ──
    let entries: Entry[];
    try {
      const text = latest.result ?? "";
      const startIdx = text.indexOf("[");
      const endIdx = text.lastIndexOf("]");
      if (startIdx === -1 || endIdx === -1) throw new Error("no JSON array in result");
      entries = JSON.parse(text.slice(startIdx, endIdx + 1));
      if (!Array.isArray(entries)) throw new Error("not an array");
    } catch (e) {
      return NextResponse.json({
        state: "parse_error",
        detail: e instanceof Error ? e.message : "unparsable result",
      });
    }

    // ── apply ──
    let updated = 0;
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
          const rawPrio = String(t.priority || "").toLowerCase();
          const taskPriority = rawPrio === "high" ? "High" : rawPrio === "low" ? "Low" : "Medium";
          await prisma.task.create({
            data: {
              name,
              status: "Not started",
              priority: taskPriority,
              category: email.category,
              dueDate: taskDue,
            },
          });
          pipeline.tasksCreated++;
        }
      }

      // ── stakeholder upsert ──
      const c = entry.contact;
      if (c && typeof c.name === "string" && c.name.trim()) {
        const emailAddr = typeof c.email === "string" && c.email.includes("@") ? c.email.trim().toLowerCase() : null;
        const existing = emailAddr
          ? await prisma.stakeholder.findFirst({ where: { email: { equals: emailAddr, mode: "insensitive" } } })
          : await prisma.stakeholder.findFirst({
              where: { name: c.name.trim(), organization: c.organization ?? null },
            });
        if (existing) {
          await prisma.stakeholder.update({
            where: { id: existing.id },
            data: {
              title: !existing.title && typeof c.title === "string" && c.title.trim() ? c.title.trim().slice(0, 120) : undefined,
              lastContactAt: !existing.lastContactAt || email.receivedAt > existing.lastContactAt ? email.receivedAt : undefined,
            },
          });
        } else {
          const typeRaw = String(c.type || "").toLowerCase();
          const type = STAKEHOLDER_TYPES.includes(typeRaw) ? typeRaw : "other";
          await prisma.stakeholder.create({
            data: {
              name: c.name.trim().slice(0, 160),
              email: emailAddr,
              organization: typeof c.organization === "string" && c.organization.trim() ? c.organization.trim().slice(0, 160) : null,
              title: typeof c.title === "string" && c.title.trim() ? c.title.trim().slice(0, 120) : null,
              type,
              lastContactAt: email.receivedAt,
            },
          });
          pipeline.stakeholdersNew++;
        }
      }
    }

    pipeline.processed += updated;
    await savePipeline({ ...pipeline });

    // ── dispatch next batch or finish ──
    const remaining = await prisma.emailItem.count({ where: { status: "triage" } });
    if (remaining > 0) {
      const next = pipeline.currentBatch + 1;
      pipeline.totalBatches = Math.max(pipeline.totalBatches, next);
      pipeline.currentBatch = next;
      await savePipeline(pipeline);
      const id = await dispatchBatch(next, pipeline);
      if (id) {
        return NextResponse.json({
          state: "applied",
          updated,
          batch: { current: next, total: pipeline.totalBatches },
          processed: pipeline.processed,
          totalEmails: pipeline.processed + remaining,
          tasksCreated: pipeline.tasksCreated,
          stakeholdersNew: pipeline.stakeholdersNew,
        });
      }
    }

    await savePipeline({ ...pipeline, requestId: null, currentBatch: pipeline.totalBatches + 1 });
    return NextResponse.json({
      state: "complete",
      updated,
      processed: pipeline.processed,
      tasksCreated: pipeline.tasksCreated,
      stakeholdersNew: pipeline.stakeholdersNew,
    });
  }

  return NextResponse.json({ error: "action must be 'start' or 'check'" }, { status: 400 });
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

export async function GET() {
  const row = await prisma.dataStore.findUnique({ where: { key: DIGEST_KEY } });
  const digest = (row?.data as unknown as DigestData) ?? { items: [], updatedAt: null };
  const grouped: Record<string, DigestItem[]> = {};
  for (const item of digest.items) {
    (grouped[item.bucket] ||= []).push(item);
  }
  return NextResponse.json({ updatedAt: digest.updatedAt ?? null, buckets: grouped });
}
