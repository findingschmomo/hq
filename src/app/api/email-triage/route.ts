import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/email-triage?status=triage&priority=high&category=board
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const priority = searchParams.get("priority");
  const category = searchParams.get("category");

  const where: Record<string, string> = {};
  if (status) where.status = status;
  if (priority) where.priority = priority;
  if (category) where.category = category;

  const [emails, counts] = await Promise.all([
    prisma.emailItem.findMany({
      where,
      orderBy: { receivedAt: "desc" },
      take: 200,
    }),
    prisma.emailItem.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  // high → medium → low, newest first within each band
  const rank: Record<string, number> = { high: 0, medium: 1, low: 2 };
  emails.sort((a, b) => (rank[a.priority] ?? 1) - (rank[b.priority] ?? 1));

  const statusCounts: Record<string, number> = {};
  for (const g of counts) statusCounts[g.status] = g._count._all;

  return NextResponse.json({ emails, statusCounts });
}

export async function POST(req: Request) {
  const body = await req.json();
  if (!body.subject?.trim()) {
    return NextResponse.json({ error: "subject required" }, { status: 400 });
  }

  const email = await prisma.emailItem.create({
    data: {
      subject: body.subject.trim(),
      senderName: body.senderName || null,
      senderEmail: body.senderEmail || null,
      category: body.category || "general",
      priority: body.priority || "medium",
      status: body.status || "triage",
      summary: body.summary || null,
      actionNote: body.actionNote || null,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      assignedTo: body.assignedTo || null,
      notes: body.notes || null,
      receivedAt: body.receivedAt ? new Date(body.receivedAt) : new Date(),
    },
  });

  return NextResponse.json(email);
}

export async function PATCH(req: Request) {
  const { id, ...updates } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const data: Record<string, unknown> = {};
  for (const key of ["subject", "senderName", "senderEmail", "category", "priority", "status", "summary", "actionNote", "assignedTo", "notes"]) {
    if (key in updates) data[key] = updates[key] || null;
  }
  if ("dueDate" in updates) data.dueDate = updates.dueDate ? new Date(updates.dueDate) : null;

  try {
    const email = await prisma.emailItem.update({ where: { id }, data });
    return NextResponse.json(email);
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}

export async function DELETE(req: Request) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.emailItem.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
