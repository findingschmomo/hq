import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * POST /api/tasks/delegate-team — clone a task to every direct report.
 * Body: { taskId: string }
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const taskId = body.taskId ? String(body.taskId) : "";
  if (!taskId) return NextResponse.json({ error: "taskId required" }, { status: 400 });

  const source = await prisma.task.findUnique({ where: { id: taskId } });
  if (!source) return NextResponse.json({ error: "task not found" }, { status: 404 });

  const reports = await prisma.stakeholder.findMany({
    where: { isDirectReport: true, archived: false },
    select: { id: true },
  });

  if (reports.length === 0) {
    return NextResponse.json({ created: 0, message: "No direct reports found" });
  }

  await prisma.task.createMany({
    data: reports.map((r) => ({
      name: source.name,
      status: "Not started",
      priority: source.priority,
      category: source.category,
      dueDate: source.dueDate,
      delegateeId: r.id,
      blockedReason: null,
    })),
  });

  return NextResponse.json({ created: reports.length });
}