import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * POST /api/goals/duplicate — copy a person's goal to every other direct
 * report. Skips people who already have an active goal with the same name.
 * Body: { id: string }
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const id = body.id ? String(body.id) : "";
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const source = await prisma.kpi.findUnique({ where: { id } });
  if (!source) return NextResponse.json({ error: "goal not found" }, { status: 404 });

  const recipients = await prisma.stakeholder.findMany({
    where: { isDirectReport: true, archived: false, id: { not: source.ownerId || undefined } },
    select: { id: true },
  });

  const existing = await prisma.kpi.findMany({
    where: { archived: false, name: source.name, ownerId: { in: recipients.map((r) => r.id) } },
    select: { ownerId: true },
  });
  const alreadyHave = new Set(existing.map((e) => e.ownerId));

  const targets = recipients.filter((r) => !alreadyHave.has(r.id));
  if (targets.length > 0) {
    await prisma.kpi.createMany({
      data: targets.map((t) => ({
        name: source.name,
        category: source.category,
        description: source.description,
        unit: source.unit,
        target: source.target,
        direction: source.direction,
        frequency: source.frequency,
        ownerId: t.id,
      })),
    });
  }

  return NextResponse.json({
    created: targets.length,
    skipped: [...alreadyHave].length,
  });
}
