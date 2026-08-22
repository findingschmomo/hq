import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/kpis?category=fundraising
// Returns KPIs with their 12 most recent readings.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");

  const kpis = await prisma.kpi.findMany({
    where: {
      archived: false,
      ...(category ? { category } : {}),
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    include: {
      readings: { orderBy: { periodStart: "desc" }, take: 12 },
    },
  });

  return NextResponse.json({ kpis });
}

export async function POST(req: Request) {
  const body = await req.json();
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  const kpi = await prisma.kpi.create({
    data: {
      name: body.name.trim(),
      description: body.description || null,
      category: body.category || "operations",
      unit: body.unit || "number",
      target: body.target !== undefined && body.target !== "" ? Number(body.target) : null,
      direction: body.direction || "up",
      frequency: body.frequency || "monthly",
      owner: body.owner || null,
    },
  });

  return NextResponse.json(kpi);
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

  try {
    const kpi = await prisma.kpi.update({ where: { id }, data });
    return NextResponse.json(kpi);
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
