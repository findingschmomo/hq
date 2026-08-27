import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/goals?category=fundraising&scope=mine|team|all
// Returns goals with their 12 most recent readings. ownerId == null → personal goal.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const scope = searchParams.get("scope"); // mine | team | all

  const goals = await prisma.kpi.findMany({
    where: {
      archived: false,
      ...(category ? { category } : {}),
      ...(scope === "mine" ? { ownerId: null } : {}),
      ...(scope === "team" ? { ownerId: { not: null } } : {}),
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    include: {
      readings: { orderBy: { periodStart: "desc" }, take: 12 },
      ownerRef: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ goals });
}

export async function POST(req: Request) {
  const body = await req.json();
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  const goal = await prisma.kpi.create({
    data: {
      name: body.name.trim(),
      description: body.description || null,
      category: body.category || "operations",
      unit: body.unit || "number",
      target: body.target !== undefined && body.target !== "" ? Number(body.target) : null,
      direction: body.direction || "up",
      frequency: body.frequency || "monthly",
      owner: body.owner || null,
      // explicit null = personal goal; a stale empty string is normalized away
      ownerId: body.ownerId ? String(body.ownerId) : null,
    },
    include: { ownerRef: { select: { id: true, name: true } } },
  });

  return NextResponse.json(goal);
}

export async function PATCH(req: Request) {
  const { id, ...updates } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const data: Record<string, unknown> = {};
  for (const key of ["name", "description", "category", "unit", "direction", "frequency", "owner"]) {
    if (key in updates) data[key] = updates[key] || null;
  }
  if ("target" in updates) data.target = updates.target === null || updates.target === "" ? null : Number(updates.target);
  if ("archived" in updates) data.archived = Boolean(updates.archived);
  if ("ownerId" in updates) data.ownerId = updates.ownerId ? String(updates.ownerId) : null;

  try {
    const goal = await prisma.kpi.update({ where: { id }, data });
    return NextResponse.json(goal);
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}

export async function DELETE(req: Request) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.kpi.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
