import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Dashboard snapshot: everything the home page needs in one call.
export async function GET() {
  const now = new Date();

  const [
    triageCount,
    highPriorityOpen,
    overdueEmails,
    dueFollowUps,
    kpis,
    stakeholders,
    recentInteractions,
    topTriageEmails,
    kanbanTasks,
    openTasks,
  ] = await Promise.all([
    // emails waiting to be triaged
    prisma.emailItem.count({ where: { status: "triage" } }),
    prisma.emailItem.count({ where: { status: { in: ["triage", "in_progress"] }, priority: "high" } }),
    prisma.emailItem.count({
      where: { status: { notIn: ["done", "archived"] }, dueDate: { lt: now } },
    }),
    // stakeholder follow-ups that are open and due
    prisma.stakeholderInteraction.findMany({
      where: { followUpNeeded: true, followUpDone: false },
      include: { stakeholder: { select: { name: true, organization: true } } },
      orderBy: [{ followUpDate: "asc" }, { date: "desc" }],
      take: 6,
    }),
    // KPI health
    prisma.kpi.findMany({
      where: { archived: false, target: { not: null } },
      include: { readings: { orderBy: { periodStart: "desc" }, take: 1 } },
    }),
    prisma.stakeholder.findMany({
      where: { archived: false, cadenceDays: { not: null } },
    }),
    prisma.stakeholderInteraction.findMany({
      orderBy: { date: "desc" },
      include: { stakeholder: { select: { id: true, name: true, organization: true, type: true } } },
      take: 6,
    }),
    prisma.emailItem.findMany({
      where: { status: "triage" },
      orderBy: [{ priority: "asc" }, { receivedAt: "desc" }],
      take: 5,
    }),
    // hermes board mirror
    prisma.hermesTask.findMany({
      orderBy: [{ status: "asc" }, { priority: "desc" }],
      take: 200,
    }),
    prisma.task.count({ where: { status: { not: "Done" } } }),
  ]);

  // KPI on/off track
  let kpisOnTrack = 0;
  let kpisOffTrack = 0;
  const kpiHighlights = kpis
    .map((k) => {
      const target = k.target ?? 0;
      const latest = k.readings[0]?.value;
      if (latest === undefined) return null;
      const ratio = target !== 0 ? (k.direction === "down" ? target / latest : latest / target) : 1;
      if (ratio >= 0.85) kpisOnTrack++;
      else kpisOffTrack++;
      return {
        id: k.id,
        name: k.name,
        unit: k.unit,
        category: k.category,
        latest,
        target: k.target,
        onTrack: ratio >= 0.85,
        periodStart: k.readings[0]?.periodStart ?? null,
      };
    })
    .filter(Boolean)
    .slice(0, 4);

  // stakeholders past their contact cadence
  const needsContact = stakeholders.filter(
    (s) =>
      !s.lastContactAt ||
      now.getTime() - new Date(s.lastContactAt).getTime() > (s.cadenceDays ?? 0) * 86_400_000,
  ).length;

  // kanban rollup
  const counts: Record<string, number> = {};
  for (const t of kanbanTasks) counts[t.status] = (counts[t.status] || 0) + 1;

  return NextResponse.json({
    email: {
      triageCount,
      highPriorityOpen,
      overdueCount: overdueEmails,
      topTriage: topTriageEmails.map((e) => ({
        id: e.id,
        subject: e.subject,
        senderName: e.senderName,
        priority: e.priority,
        receivedAt: e.receivedAt.toISOString(),
      })),
    },
    followUps: dueFollowUps
      .filter((f) => !f.followUpDate || new Date(f.followUpDate).getTime() <= now.getTime() + 3 * 86_400_000)
      .slice(0, 4)
      .map((f) => ({
        id: f.id,
        summary: f.summary,
        person: f.stakeholder.name,
        org: f.stakeholder.organization,
        dueDate: f.followUpDate?.toISOString() ?? null,
      })),
    kpis: {
      tracked: kpis.length,
      onTrack: kpisOnTrack,
      offTrack: kpisOffTrack,
      highlights: kpiHighlights,
    },
    stakeholders: {
      needsContact,
      total: stakeholders.length,
      recentTouches: recentInteractions.map((i) => ({
        id: i.id,
        summary: i.summary,
        channel: i.channel,
        person: i.stakeholder.name,
        org: i.stakeholder.organization,
        date: i.date.toISOString(),
      })),
    },
    hermesKanban: {
      total: kanbanTasks.length,
      counts,
      tasks: kanbanTasks.slice(0, 5).map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        assignee: t.assignee,
      })),
    },
    openTasks,
  });
}
