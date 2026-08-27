import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** GET /api/team — direct reports + schools with everything the hub needs. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id"); // optional filter down to one person

  const include = {
    interactions: { orderBy: { date: "desc" as const }, take: 10 },
    delegatedTasks: {
      where: { status: { not: "Done" } },
      orderBy: [{ priority: "asc" as const }, { createdAt: "desc" as const }],
      take: 15,
      include: { sourceEmail: { select: { gmailId: true, subject: true } } },
    },
    metrics: { orderBy: { recordedAt: "desc" as const }, take: 100 },
  };

  const coordinators = await prisma.stakeholder.findMany({
    where: { isDirectReport: true, archived: false, ...(id ? { id } : {}) },
    orderBy: [{ importance: "asc" }, { name: "asc" }],
    include: { ...include, school: { select: { id: true, name: true } } },
  });

  // schools this director oversees (People entries typed "school")
  const schools = id
    ? []
    : await prisma.stakeholder.findMany({
        where: { type: "school", archived: false },
        orderBy: [{ name: "asc" }],
        include: {
          ...include,
          members: { where: { archived: false }, select: { id: true, name: true } },
        },
      });

  // attach each person's active goals (on-track status computed client-side)
  const peopleIds = [...coordinators.map((c) => c.id), ...schools.map((s) => s.id)];
  const allGoals =
    peopleIds.length > 0
      ? await prisma.kpi.findMany({
          where: { archived: false, ownerId: { in: peopleIds } },
          include: {
            readings: { orderBy: { periodStart: "desc" }, take: 12 },
            ownerRef: { select: { id: true, name: true } },
          },
        })
      : [];

  // Goals are SHARED across the assignment link: a goal owned by a member also
  // shows on their school's card and vice versa. Single row of truth — no dupes.
  type WithGoals = { id: string; school?: { id: string; name: string } | null };
  const byOwner = new Map<string, typeof allGoals>();
  for (const g of allGoals) {
    if (!g.ownerId) continue;
    const list = byOwner.get(g.ownerId) || [];
    list.push(g);
    byOwner.set(g.ownerId, list);
  }

  const shared = <T extends WithGoals>(p: T) => {
    let own = byOwner.get(p.id) || [];
    if ("school" in p && p.school) {
      own = [...own, ...(byOwner.get(p.school.id) || []).map((g) => ({ ...g, sharedFromName: p.school!.name }))].filter(
        (g, i, arr) => arr.findIndex((x) => x.id === g.id) === i
      );
    }
    return { ...p, goals: own };
  };

  const schoolsWithMembers = schools.map((s) => {
    const memberIds = s.members.map((m) => m.id);
    const merged = [
      ...(byOwner.get(s.id) || []),
      ...memberIds.flatMap((mid) =>
        (byOwner.get(mid) || []).map((g) => ({
          ...g,
          sharedFromName: coordinators.find((c) => c.id === mid)?.name,
        }))
      ),
    ].filter((g, i, arr) => arr.findIndex((x) => x.id === g.id) === i);
    return { ...s, goals: merged };
  });

  return NextResponse.json({
    coordinators: coordinators.map(shared),
    schools: schoolsWithMembers,
  });
}
