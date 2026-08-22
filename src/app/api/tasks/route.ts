import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const tasks = await prisma.task.findMany({
    orderBy: [{ status: "asc" }, { priority: "asc" }, { createdAt: "desc" }],
    take: 200,
  });
  return NextResponse.json({ tasks });
}

export async function POST(req: Request) {
  const { name, status, priority, category, dueDate } = await req.json();
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
    },
  });
  return NextResponse.json(task);
}

export async function PATCH(req: Request) {
  const { id, ...updates } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const data: Record<string, unknown> = {};
  for (const key of ["name", "status", "priority", "category"]) {
    if (key in updates) data[key] = updates[key];
  }
  if ("dueDate" in updates) data.dueDate = updates.dueDate ? new Date(updates.dueDate) : null;

  try {
    const task = await prisma.task.update({ where: { id }, data });
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
