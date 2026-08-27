import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const delegateeId = searchParams.get("delegateeId");

  const tasks = await prisma.task.findMany({
    where: delegateeId ? { delegateeId } : undefined,
    orderBy: [{ status: "asc" }, { priority: "asc" }, { createdAt: "desc" }],
    take: 200,
    include: {
      delegatee: { select: { id: true, name: true, organization: true } },
      sourceEmail: { select: { gmailId: true, subject: true } },
    },
  });
  return NextResponse.json({ tasks });
}

export async function POST(req: Request) {
  const { name, status, priority, category, dueDate, delegateeId, blockedReason } = await req.json();
  if (!name?.trim()) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  const task = await prisma.task.create({
    data: {
      name: name.trim(),
      status: status || "Not started",
      priority: priority || "Medium",
      category: category || null,
      dueDate: dueDate ? new Date(dueDate) : null,
      delegateeId: delegateeId || null,
      blockedReason: status === "Blocked" && blockedReason?.trim() ? blockedReason.trim().slice(0, 1000) : null,
    },
    include: { delegatee: { select: { id: true, name: true, organization: true } } },
  });
  return NextResponse.json(task);
}

export async function PATCH(req: Request) {
  const { id, ...updates } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const validPriorities = ["High", "Medium", "Low"];
  // Safety net: if client sends garbage (like a task ID) in priority, ignore it
  if ("priority" in updates) {
    const p = updates.priority as string;
    if (!validPriorities.includes(p)) {
      // Silently ignore invalid priority values (e.g., cached client sending task ID)
      delete updates.priority;
    }
  }

  const data: Record<string, unknown> = {};
  for (const key of ["name", "status", "priority", "category"]) {
    if (key in updates) data[key] = updates[key];
  }
  if ("dueDate" in updates) {
    if (updates.dueDate) {
      const parsed = new Date(updates.dueDate as string);
      if (isNaN(parsed.getTime())) {
        // Silently ignore invalid dueDate
      } else {
        data.dueDate = parsed;
      }
    } else {
      data.dueDate = null;
    }
  }
  // Validate delegateeId exists before setting
  if ("delegateeId" in updates) {
    const delegateeId = updates.delegateeId as string;
    if (delegateeId && delegateeId.startsWith("cmt")) {
      // Validate it's a real stakeholder
      const stakeholder = await prisma.stakeholder.findUnique({ where: { id: delegateeId } });
      if (stakeholder) {
        data.delegateeId = delegateeId;
      }
      // else silently ignore invalid delegateeId
    } else {
      data.delegateeId = delegateeId || null;
    }
  }
  if ("blockedReason" in updates) data.blockedReason = updates.blockedReason?.trim() ? updates.blockedReason.trim().slice(0, 1000) : null;

  // moving a task out of Blocked clears the reason unless a new one is supplied
  if ("status" in updates && updates.status !== "Blocked" && !("blockedReason" in updates)) {
    data.blockedReason = null;
  }

  try {
    const task = await prisma.task.update({
      where: { id },
      data,
      include: { delegatee: { select: { id: true, name: true, organization: true } } },
    });
    return NextResponse.json(task);
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}

export async function DELETE(req: Request) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.task.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
