import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { compileWeeklyData } from "@/lib/weekly";

export const dynamic = "force-dynamic";

// Public feed for the Canva site — no auth, but rate-limited by design (cached 5m via CDN if you put it behind one)
// If you want to lock it, add ?key=INTERNAL_API_SECRET check.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const pod = searchParams.get("pod"); // e.g. ?pod=Pod%201
  const scope = searchParams.get("scope") || "all"; // all | pod

  try {
    const [pods, resources, weekly] = await Promise.all([
      prisma.pod.findMany({
        include: {
          director: { select: { id: true, name: true, email: true } },
          schools: {
            select: {
              id: true,
              name: true,
              schoolProfile: true,
              members: { select: { id: true, name: true, email: true } },
            },
          },
        },
        orderBy: { name: "asc" },
      }),
      prisma.resource.findMany({
        orderBy: [{ featured: "desc" }, { pinned: "desc" }, { updatedAt: "desc" }],
      }),
      compileWeeklyData().catch(() => null),
    ]);

    // Filter pods if requested
    const filteredPods = pod ? pods.filter((p) => p.name === pod || p.id === pod) : pods;

    // For weekly, scope to pod if requested (filter priorities/shared to that pod's coordinators)
    let weeklyForSite = weekly;
    if (weekly && scope !== "all" && pod) {
      const targetPod = pods.find((p) => p.name === pod || p.id === pod);
      if (targetPod) {
        const coordinatorIds = new Set(targetPod.schools.flatMap((s) => s.members.map((m) => m.id)));
        const filterByPod = (tasks: typeof weekly.priorities) =>
          tasks.filter((t) => {
            // Keep if no delegatee or delegatee is in this pod
            // We don't have delegateeId in WeeklyTask, only delegateeName — so match by name
            const names = targetPod.schools.flatMap((s) => s.members.map((m) => m.name));
            return names.includes(t.delegateeName) || t.delegateeName === "Unassigned";
          });
        weeklyForSite = {
          ...weekly,
          priorities: filterByPod(weekly.priorities),
          sharedTasks: filterByPod(weekly.sharedTasks),
        };
      }
    }

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      pods: filteredPods,
      resources,
      weekly: weeklyForSite
        ? {
            weekOf: weeklyForSite.weekOf.toISOString().split("T")[0],
            introText: weeklyForSite.introText,
            curriculumText: weeklyForSite.curriculumText,
            dataAsks: weeklyForSite.dataAsks,
            importantLinks: weeklyForSite.importantLinks,
            prioritiesText: weeklyForSite.prioritiesText,
            priorities: weeklyForSite.priorities,
            sharedTasks: weeklyForSite.sharedTasks,
            upcomingEvents: weeklyForSite.upcomingEvents,
            gifUrl: weeklyForSite.gifUrl,
            sideImageUrl: weeklyForSite.sideImageUrl,
          }
        : null,
    });
  } catch (err) {
    console.error("site feed error:", err);
    return NextResponse.json({ error: "Failed to build site feed" }, { status: 500 });
  }
}
