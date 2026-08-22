import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// POST /api/kpis/readings — record a value for a KPI
export async function POST(req: Request) {
  const body = await req.json();
  if (!body.kpiId || body.value === undefined || body.value === "") {
    return NextResponse.json({ error: "kpiId and value required" }, { status: 400 });
  }

  const periodStart = body.periodStart ? new Date(body.periodStart) : startOfCurrentPeriod();

  try {
    const reading = await prisma.kpiReading.upsert({
      where: { kpiId_periodStart: { kpiId: body.kpiId, periodStart } },
      update: { value: Number(body.value), note: body.note || null },
      create: {
        kpiId: body.kpiId,
        value: Number(body.value),
        periodStart,
        note: body.note || null,
      },
    });
    return NextResponse.json(reading);
  } catch {
    return NextResponse.json({ error: "kpi not found" }, { status: 404 });
  }
}

function startOfCurrentPeriod(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1); // monthly bucket by default
}
