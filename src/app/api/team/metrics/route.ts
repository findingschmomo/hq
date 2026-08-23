import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** POST /api/team/metrics — record a metric for a coordinator. */
export async function POST(req: Request) {
  const { stakeholderId, name, value, unit, recordedAt, note } = await req.json();
  if (!stakeholderId || !name?.trim() || (value ?? "") === "" || isNaN(Number(value))) {
    return NextResponse.json({ error: "stakeholderId, name and numeric value required" }, { status: 400 });
  }
  const metric = await prisma.coordinatorMetric.create({
    data: {
      stakeholderId,
      name: name.trim().slice(0, 80),
      value: Number(value),
      unit: unit?.trim().slice(0, 24) || null,
      recordedAt: recordedAt ? new Date(recordedAt) : new Date(),
      note: note?.trim().slice(0, 300) || null,
    },
  });
  return NextResponse.json(metric);
}

/** DELETE /api/team/metrics — remove a mis-entered entry. */
export async function DELETE(req: Request) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await prisma.coordinatorMetric.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
