import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* Hermes-assisted triage.
   start: bundle every untriaged email into one `oneshot` AgentRequest.
          The bridge runs it via the hermes CLI (read-only classification,
          so sideEffecting stays false) and stores the text result.
   check: poll the latest triage request; when done, parse the JSON the
          agent produced and apply category/priority/summary/actionNote
          to each email. */

const TRIAGE_TITLE_PREFIX = "Triage inbox";
const APPLIED_KEY = "email-triage:last-applied";

const CATEGORIES = ["general", "board", "staff", "funder", "partner", "resident", "press", "facilities", "finance"];
const PRIORITIES = ["high", "medium", "low"];

function buildPrompt(emails: { id: string; senderName: string | null; subject: string; receivedAt: Date; summary?: string | null }[]): string {
  const list = emails
    .map((e) => {
      const context = (e.summary ?? "").replace(/\s+/g, " ").slice(0, 350);
      return [
        `#id:${e.id}`,
        `From: ${e.senderName ?? "unknown"}`,
        `Subject: ${e.subject}`,
        `Received: ${e.receivedAt.toISOString().slice(0, 10)}`,
        `Content: ${context}`,
      ].join(" | ");
    })
    .join("\n---\n");

  return [
    "You are the chief of staff for the executive director of Heights Philadelphia, a community nonprofit in Philadelphia.",
    "Triage each email below. For EVERY item return exactly these fields:",
    `- id: copy the #id value unchanged`,
    `- category: one of ${CATEGORIES.join(", ")}`,
    `- priority: one of ${PRIORITIES.join(", ")} (high = board/funders/time-sensitive money or people matters)`,
    `- summary: one plain sentence on what the sender wants`,
    `- actionNote: short imperative next step (e.g. "Reply with program dates")`,
    "",
    "Respond with ONLY a raw JSON array — no prose, no markdown fences:",
    '[{"id":"...","category":"...","priority":"...","summary":"...","actionNote":"..."}]',
    "",
    "EMAILS:",
    list,
  ].join("\n");
}

export async function POST(req: Request) {
  const { action } = await req.json().catch(() => ({ action: undefined }));

  if (action === "start") {
    const untriaged = await prisma.emailItem.findMany({
      where: { status: "triage" },
      orderBy: { receivedAt: "desc" },
      take: 30,
    });
    if (untriaged.length === 0) {
      return NextResponse.json({ state: "nothing_to_triage" });
    }

    // don't stack duplicate runs
    const inFlight = await prisma.agentRequest.findFirst({
      where: {
        title: { startsWith: TRIAGE_TITLE_PREFIX },
        status: { in: ["queued", "approved", "running"] },
      },
    });
    if (inFlight) {
      return NextResponse.json({ state: inFlight.status, requestId: inFlight.id });
    }

    const request = await prisma.agentRequest.create({
      data: {
        origin: "web",
        kind: "oneshot",
        title: `${TRIAGE_TITLE_PREFIX} (${untriaged.length})`,
        prompt: buildPrompt(untriaged),
        sideEffecting: false,
        status: "queued",
      },
    });
    return NextResponse.json({ state: "queued", requestId: request.id });
  }

  if (action === "check") {
    const appliedRow = await prisma.dataStore.findUnique({ where: { key: APPLIED_KEY } });
    const appliedId = appliedRow ? String((appliedRow.data as { requestId?: string }).requestId ?? "") : "";

    const latest = await prisma.agentRequest.findFirst({
      where: { title: { startsWith: TRIAGE_TITLE_PREFIX } },
      orderBy: { createdAt: "desc" },
    });

    if (!latest || latest.id === appliedId) {
      return NextResponse.json({ state: "idle" });
    }
    if (latest.status !== "done") {
      return NextResponse.json({ state: latest.status, requestId: latest.id, error: latest.error });
    }

    // parse + apply
    let entries: unknown[];
    try {
      const text = latest.result ?? "";
      const start = text.indexOf("[");
      const end = text.lastIndexOf("]");
      if (start === -1 || end === -1) throw new Error("no JSON array in result");
      entries = JSON.parse(text.slice(start, end + 1));
      if (!Array.isArray(entries)) throw new Error("not an array");
    } catch (e) {
      return NextResponse.json({
        state: "parse_error",
        detail: e instanceof Error ? e.message : "unparsable result",
      });
    }

    let updated = 0;
    for (const raw of entries) {
      const entry = raw as Record<string, unknown>;
      const id = typeof entry.id === "string" ? entry.id : "";
      if (!id) continue;
      const category = CATEGORIES.includes(String(entry.category)) ? String(entry.category) : null;
      const priority = PRIORITIES.includes(String(entry.priority)) ? String(entry.priority) : null;
      const summary = typeof entry.summary === "string" ? entry.summary.slice(0, 1000) : null;
      const actionNote = typeof entry.actionNote === "string" ? entry.actionNote.slice(0, 500) : null;

      try {
        await prisma.emailItem.update({
          where: { id },
          data: { ...(category && { category }), ...(priority && { priority }), ...(summary && { summary }), ...(actionNote && { actionNote }) },
        });
        updated++;
      } catch {
        // item deleted since dispatch — ignore
      }
    }

    await prisma.dataStore.upsert({
      where: { key: APPLIED_KEY },
      update: { data: { requestId: latest.id, updatedAt: new Date().toISOString() } },
      create: { key: APPLIED_KEY, data: { requestId: latest.id, updatedAt: new Date().toISOString() } },
    });

    return NextResponse.json({ state: "applied", updated, requestId: latest.id });
  }

  return NextResponse.json({ error: "action must be 'start' or 'check'" }, { status: 400 });
}
