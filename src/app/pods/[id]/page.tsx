"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Mail, School, User, MapPin, Users, GraduationCap } from "lucide-react";

interface PodDetail {
  id: string;
  name: string;
  director: { id: string; name: string; email: string | null } | null;
  schools: {
    id: string;
    name: string;
    schoolProfile: { enrollment: number | null; grades: string | null; principal: string | null; address: string | null; facts: string | null; website: string | null } | null;
    members: { id: string; name: string; email: string | null }[];
  }[];
}

export default function PodPage() {
  const params = useParams();
  const podName = decodeURIComponent(params.id as string);
  const [pod, setPod] = useState<PodDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/pods`)
      .then((r) => r.json())
      .then((j) => {
        const found = (j.pods || []).find((p: PodDetail) => p.name === podName || p.id === podName);
        setPod(found || null);
      })
      .finally(() => setLoading(false));
  }, [podName]);

  if (loading) return <div className="panel p-8 text-center text-[var(--text-3)]">Loading {podName}…</div>;
  if (!pod) return <div className="panel p-8 text-center text-[var(--text-3)]">Pod not found — <Link href="/pods" className="text-[var(--accent)]">back to pods</Link></div>;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <Link href="/pods" className="inline-flex items-center gap-1.5 text-[12px] text-[var(--text-3)] hover:text-[var(--text)]">
        <ArrowLeft className="w-3.5 h-3.5" /> All pods
      </Link>

      <div className="panel p-6" style={{ backgroundColor: "#0F1F3C", color: "white", border: "none" }}>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-[24px] font-black tracking-wide">{pod.name.toUpperCase()}</h1>
            <p className="text-[12px] text-white/70 mt-1 flex items-center gap-2">
              <User className="w-3.5 h-3.5" /> Director: {pod.director ? `${pod.director.name} ${pod.director.email ? `· ${pod.director.email}` : ""}` : "—"}
            </p>
          </div>
          <div className="hidden md:flex items-center gap-2 text-white/60">
            <Users className="w-4 h-4" /> {pod.schools.length} schools · {pod.schools.flatMap((s) => s.members).length} coordinators
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {pod.schools.map((school) => (
          <div key={school.id} className="panel p-5 space-y-3">
            <div className="flex items-center gap-2">
              <School className="w-4 h-4 text-[var(--accent)]" />
              <h2 className="font-semibold text-[var(--text)]">{school.name}</h2>
            </div>

            <div className="rounded-[var(--r-sm)] bg-[var(--surface-1)] border border-[var(--line)] p-3">
              <p className="text-[11px] font-semibold text-[var(--text-3)] mb-1.5 flex items-center gap-1"><Users className="w-3 h-3" /> Coordinator{school.members.length !== 1 ? "s" : ""}</p>
              {school.members.length === 0 ? (
                <p className="text-[12px] text-[var(--text-4)] italic">Vacant — hiring</p>
              ) : (
                <ul className="space-y-1">
                  {school.members.map((m) => (
                    <li key={m.id} className="text-[12px] text-[var(--text-2)] flex items-center gap-2">
                      <span>{m.name}</span>
                      {m.email && <a href={`mailto:${m.email}`} className="text-[var(--accent)] inline-flex items-center gap-1"><Mail className="w-3 h-3" />{m.email}</a>}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-[var(--r-sm)] bg-[var(--surface-1)] border border-[var(--line)] p-3 space-y-1.5">
              <p className="text-[11px] font-semibold text-[var(--text-3)] flex items-center gap-1"><GraduationCap className="w-3 h-3" /> School facts</p>
              {school.schoolProfile ? (
                <>
                  {school.schoolProfile.principal && <p className="text-[12px] text-[var(--text-2)]">Principal: {school.schoolProfile.principal}</p>}
                  {school.schoolProfile.grades && <p className="text-[12px] text-[var(--text-2)]">Grades: {school.schoolProfile.grades}</p>}
                  {school.schoolProfile.enrollment != null && <p className="text-[12px] text-[var(--text-2)]">Enrollment: {school.schoolProfile.enrollment}</p>}
                  {school.schoolProfile.address && <p className="text-[12px] text-[var(--text-2)] flex items-start gap-1"><MapPin className="w-3 h-3 mt-0.5 shrink-0" />{school.schoolProfile.address}</p>}
                  {school.schoolProfile.facts ? (
                    <p className="text-[12px] text-[var(--text-2)] leading-relaxed whitespace-pre-wrap">{school.schoolProfile.facts}</p>
                  ) : (
                    <p className="text-[11px] text-[var(--text-4)] italic">Add facts in People → school profile</p>
                  )}
                </>
              ) : (
                <p className="text-[11px] text-[var(--text-4)] italic">No profile yet — add in People</p>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Link href="/people" className="inline-flex items-center justify-center rounded-[var(--r-sm)] border border-[var(--line)] px-3 py-1.5 text-[12px] text-[var(--text-3)] hover:border-[var(--line-strong)]">Edit in People</Link>
        <a href={`/api/site?pod=${encodeURIComponent(pod.name)}`} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center rounded-[var(--r-sm)] border border-[var(--line)] px-3 py-1.5 text-[12px] text-[var(--text-3)] hover:border-[var(--line-strong)]">View JSON for Canva</a>
      </div>
    </div>
  );
}
