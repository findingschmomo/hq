"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, School, User, ArrowRight } from "lucide-react";

interface Pod {
  id: string;
  name: string;
  director: { id: string; name: string; email: string | null } | null;
  schools: {
    id: string;
    name: string;
    schoolProfile: { enrollment: number | null; grades: string | null; principal: string | null; facts: string | null } | null;
    members: { id: string; name: string; email: string | null }[];
  }[];
}

export default function PodsPage() {
  const [pods, setPods] = useState<Pod[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/pods")
      .then((r) => r.json())
      .then((j) => setPods(j.pods || []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="panel p-8 text-center text-[var(--text-3)]">Loading pods…</div>;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-[22px] font-semibold text-[var(--text)]">Pods</h1>
        <p className="text-[13px] text-[var(--text-3)] mt-1">3 teams · 14 schools · 19 coordinators — each Pod is one Canva template, fed live from HQ</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {pods.map((pod) => (
          <Link key={pod.id} href={`/pods/${encodeURIComponent(pod.name)}`} className="panel p-5 hover:border-[var(--accent)] transition-colors group">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-full bg-[var(--accent)]/10 flex items-center justify-center">
                <Users className="w-4 h-4 text-[var(--accent)]" />
              </div>
              <h2 className="font-semibold text-[var(--text)]">{pod.name}</h2>
            </div>
            <p className="text-[12px] text-[var(--text-3)] flex items-center gap-1.5 mb-3">
              <User className="w-3.5 h-3.5" /> {pod.director ? pod.director.name : "No director"} {pod.director?.email ? `· ${pod.director.email}` : ""}
            </p>
            <div className="space-y-2">
              {pod.schools.map((s) => (
                <div key={s.id} className="flex items-center gap-2 text-[12px] bg-[var(--surface-1)] rounded-[var(--r-sm)] px-2.5 py-1.5 border border-[var(--line)]">
                  <School className="w-3.5 h-3.5 text-[var(--text-4)] shrink-0" />
                  <span className="text-[var(--text-2)] truncate">{s.name}</span>
                  <span className="text-[var(--text-4)] text-[11px] ml-auto truncate">{s.members.map((m) => m.name).join(", ") || "vacant"}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-1 text-[12px] text-[var(--accent)] mt-3 group-hover:gap-2 transition-all">
              View pod <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </Link>
        ))}
      </div>

      <div className="panel p-4 bg-[var(--surface-1)] border-dashed">
        <p className="text-[12px] text-[var(--text-3)]">
          <strong className="text-[var(--text)]">Canva →</strong> Duplicate one Pod page template 3× in Canva, set each page’s data source to <code className="bg-white px-1.5 py-0.5 rounded text-[11px]">/api/site?pod=Pod%201</code> (or Sheets). Add a school to a Pod in People → it appears on the right Pod page after a Sheet refresh — no Canva rebuild.
        </p>
      </div>
    </div>
  );
}
