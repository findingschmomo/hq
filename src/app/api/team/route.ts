import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** GET /api/team — the director's direct reports with everything the hub needs. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id"); // optional filter down to one person

  const coordinators = await prisma.stakeholder.findMany({
    where: { isDirectReport: true, archived: false, ...(id ? { id } : {}) },
    orderBy: [{ importance: "asc" }, { name: "asc" }],
    include: {
      interactions: { orderBy: { date: "desc" }, take: 10 },
      delegatedTasks: {
        where: { status: { not: "Done" } },
        orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
        take: 15,
      },
      metrics: { orderBy: { recordedAt: "desc" }, take: 100 },
    },
  });

  return NextResponse.json({ coordinators });
}
