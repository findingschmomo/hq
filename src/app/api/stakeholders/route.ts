import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/stakeholders?type=funder&q=smith
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");
  const q = searchParams.get("q");

  const stakeholders = await prisma.stakeholder.findMany({
    where: {
      archived: false,
      ...(type ? { type } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { organization: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ importance: "asc" }, { lastContactAt: "desc" }],
    include: {
      interactions: { orderBy: { date: "desc" }, take: 5 },
    },
  });

  // stale = no contact in cadenceDays (if set)
  const now = Date.now();
  const withStatus = stakeholders.map((s) => ({
    ...s,
    staleDays:
      s.cadenceDays && s.lastContactAt
        ? Math.floor((now - new Date(s.lastContactAt).getTime()) / 86_400_000) - s.cadenceDays
        : null,
    needsContact:
      s.cadenceDays != null &&
      (!s.lastContactAt ||
        now - new Date(s.lastContactAt).getTime() > s.cadenceDays * 86_400_000),
  }));

  return NextResponse.json({ stakeholders: withStatus });
}

export async function POST(req: Request) {
  const body = await req.json();
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  const stakeholder = await prisma.stakeholder.create({
    data: {
      name: body.name.trim(),
      organization: body.organization || null,
      title: body.title || null,
      type: body.type || "partner",
      email: body.email || null,
      phone: body.phone || null,
      importance: body.importance || "normal",
      cadenceDays: body.cadenceDays ? Number(body.cadenceDays) : null,
      notes: body.notes || null,
    },
  });

  return NextResponse.json(stakeholder);
}

export async function PATCH(req: Request) {
  const { id, ...updates } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const data: Record<string, unknown> = {};
  for (const key of ["name", "organization", "title", "type", "email", "phone", "importance", "notes"]) {
    if (key in updates) data[key] = updates[key] || null;
  }
  if ("cadenceDays" in updates) data.cadenceDays = updates.cadenceDays ? Number(updates.cadenceDays) : null;
  if ("archived" in updates) data.archived = Boolean(updates.archived);

  try {
    const stakeholder = await prisma.stakeholder.update({ where: { id }, data });
    return NextResponse.json(stakeholder);
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}

export async function DELETE(req: Request) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.stakeholder.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
