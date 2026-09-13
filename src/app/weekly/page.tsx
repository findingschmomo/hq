"use client";

import { useEffect, useRef, useState } from "react";
import { Calendar, Send, Mail, AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/kit";

interface Recipient { id: string; name: string; email: string; }
interface TaskItem { id: string; name: string; status: string; priority: string; dueDate: string | null; delegateeName: string; }
interface CalEvent { id: string; title: string; startISO: string; location: string | null; }
interface CalendarInfo { id: string; summary: string; primary?: boolean; backgroundColor?: string; }

interface WeeklyData {
  weekOf: string;
  recipients: Recipient[];
  priorities: TaskItem[];
  sharedTasks: TaskItem[];
  upcomingEvents: CalEvent[];
  schoolVisits: { schoolName: string; events: { title: string; startISO: string; location: string | null }[] }[];
  horizonEvents: { title: string; startISO: string; location: string | null }[];
  introText: string;
  curriculumText: string;
  dataAsks: string;
  importantLinks: string;
  prioritiesText: string;
  upcomingManual: string;
  gifUrl: string;
  sideImageUrl: string;
  sideImagePos: string;
  sideImageScale: number;
  sideImageCaption: string;
  calendarId: string | null;
  calendarName: string | null;
  hiddenEventIds: string[];
  personalNote: string;
  html: string;
  text: string;
}

export default function WeeklyPage() {
  const [data, setData] = useState<WeeklyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [introText, setIntroText] = useState("");
  const [curriculumText, setCurriculumText] = useState("");
  const [dataAsks, setDataAsks] = useState("");
  const [importantLinks, setImportantLinks] = useState("");
  const [prioritiesText, setPrioritiesText] = useState("");
  const [gifUrl, setGifUrl] = useState("");
  const [sideImageUrl, setSideImageUrl] = useState("");
  const [sideImagePos, setSideImagePos] = useState("50% 50%");
  const [sideImageScale, setSideImageScale] = useState(100);
  const [sideImageCaption, setSideImageCaption] = useState("");
  const [kudosText, setKudosText] = useState("");
  const [calendarId, setCalendarId] = useState<string | null>(null);
  const [calendarName, setCalendarName] = useState<string | null>(null);
  const [hiddenEventIds, setHiddenEventIds] = useState<string[]>([]);
  const [calendars, setCalendars] = useState<CalendarInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "dirty" | "saving" | "saved">("idle");
  const [fishWidth, setFishWidth] = useState(96);

  const loadedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef({ introText: "", curriculumText: "", dataAsks: "", importantLinks: "", prioritiesText: "", gifUrl: "", sideImageUrl: "", sideImagePos: "50% 50%", sideImageScale: 100, sideImageCaption: "", kudosText: "", calendarId: null as string | null, calendarName: null as string | null, hiddenEventIds: [] as string[] });
  latestRef.current = { introText, curriculumText, dataAsks, importantLinks, prioritiesText, gifUrl, sideImageUrl, sideImagePos, sideImageScale, sideImageCaption, kudosText, calendarId, calendarName, hiddenEventIds };

  async function saveNotes() {
    try {
      setSaveState("saving");
      const res = await fetch("/api/weekly/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(latestRef.current),
      });
      if (!res.ok) throw new Error("save failed");
      const json = await res.json();
      setSaveState(json.saved ? "saved" : "idle");
    } catch {
      setSaveState("dirty");
    }
  }

  useEffect(() => {
    if (!loadedRef.current) return;
    setSaveState("dirty");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(saveNotes, 900);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [introText, curriculumText, dataAsks, importantLinks, prioritiesText, gifUrl, sideImageUrl, sideImagePos, sideImageScale, sideImageCaption, kudosText, calendarId, calendarName, hiddenEventIds]);

  useEffect(() => {
    function flush() {
      if (document.visibilityState === "hidden" && saveTimerRef.current) {
        navigator.sendBeacon("/api/weekly/notes", new Blob([JSON.stringify(latestRef.current)], { type: "application/json" }));
        saveTimerRef.current = null;
      }
    }
    document.addEventListener("visibilitychange", flush);
    return () => document.removeEventListener("visibilitychange", flush);
  }, []);

  async function fetchPreview() {
    setLoading(true);
    setError(null);
    try {
      const podParam = podScope && podScope !== "all" ? `?pod=${encodeURIComponent(podScope)}` : "";
      const res = await fetch(`/api/weekly/preview${podParam}`);
      if (!res.ok) throw new Error("Failed to load preview");
      const json = await res.json();
      setData(json);
      setIntroText(json.introText || json.personalNote || "");
      setCurriculumText(json.curriculumText || "");
      setDataAsks(json.dataAsks || "");
      setImportantLinks(json.importantLinks || "");
      setPrioritiesText(json.prioritiesText || "");
      setGifUrl(json.gifUrl || "");
      setSideImageUrl(json.sideImageUrl || "");
      setSideImagePos(json.sideImagePos || "50% 50%");
      setSideImageScale(json.sideImageScale || 100);
      setSideImageCaption(json.sideImageCaption || "");
      setKudosText(json.kudosText || "");
      setCalendarId(json.calendarId || null);
      setCalendarName(json.calendarName || null);
      setHiddenEventIds(json.hiddenEventIds || []);
      loadedRef.current = true;
      setSaveState("idle");
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  async function fetchCalendars() {
    try {
      const res = await fetch("/api/calendar/list");
      if (!res.ok) return;
      const j = await res.json();
      setCalendars(j.calendars || []);
    } catch {}
  }

  async function handleCalendarChange(id: string) {
    const cal = calendars.find((c) => c.id === id);
    setCalendarId(id);
    setCalendarName(cal?.summary || null);
    // save will trigger via effect, then refresh preview to get new events
    setTimeout(() => fetchPreview(), 1200);
  }

  async function createDraft() {
    if (!data) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/weekly/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekOf: data.weekOf,
          curriculumText,
          introText,
          dataAsks,
          importantLinks,
          prioritiesText,
          gifUrl,
          sideImageUrl,
          sideImagePos,
          sideImageScale,
          sideImageCaption,
          kudosText,
          calendarId,
          calendarName,
          hiddenEventIds,
          html: data.html,
          text: data.text,
          recipients: data.recipients,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create draft");
      }
      setSuccess("Gmail draft created! Check your drafts folder.");
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  function formatEventDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }

  const autoPrioritiesPreview = data?.priorities.map((t) => `• ${t.name}${t.dueDate ? ` — ${new Date(t.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}`).join("\n") || "";

  // Fish scales with the bubble — more priorities → bigger fish to fill the orange
  useEffect(() => {
    const text = prioritiesText !== "" ? prioritiesText : autoPrioritiesPreview;
    const lines = text.split("\n").filter((l) => l.trim().length > 0).length;
    setFishWidth(Math.min(140, Math.max(64, 72 + lines * 14)));
  }, [prioritiesText, autoPrioritiesPreview]);

  const [podScope, setPodScope] = useState<string>("Pod 1");
  useEffect(() => { fetchPreview(); fetchCalendars(); }, []);
  useEffect(() => { fetchPreview(); }, [podScope]);

  if (loading) return <div className="panel p-8 text-center text-[var(--text-3)]">Loading weekly builder…</div>;

  return (
    <div className="space-y-4 max-w-[820px] mx-auto pb-8">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-semibold text-[var(--text)]">Weekly Update Builder</h1>
          <p className="text-[var(--text-3)] text-[12px] mt-0.5">Week of {new Date(data!.weekOf).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} · {data!.recipients.length} recipients</p>
          <div className="flex items-center gap-1 mt-2">
            <span className="text-[11px] text-[var(--text-4)] mr-1">Priorities scope:</span>
            <button onClick={() => setPodScope("Pod 1")} className={`text-[11px] px-2.5 py-1 rounded-full border ${podScope === "Pod 1" ? "bg-[var(--accent)] text-white border-[var(--accent)]" : "bg-white text-[var(--text-3)] border-[var(--line)]"}`}>My Pod (Pod 1)</button>
            <button onClick={() => setPodScope("all")} className={`text-[11px] px-2.5 py-1 rounded-full border ${podScope === "all" ? "bg-[var(--accent)] text-white border-[var(--accent)]" : "bg-white text-[var(--text-3)] border-[var(--line)]"}`}>All 19</button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-[11px] ${saveState === "dirty" ? "text-[var(--text-4)]" : "text-[var(--up)]"}`}>
            {saveState === "saving" ? "Saving…" : saveState === "saved" ? "✓ Saved" : saveState === "dirty" ? "Unsaved…" : ""}
          </span>
          <Button variant="ghost" size="sm" onClick={fetchPreview} disabled={loading}>
            <Calendar className="w-3.5 h-3.5 mr-1.5" /> Refresh
          </Button>
          <Button variant="primary" size="sm" onClick={createDraft} disabled={saving}>
            <Send className="w-3.5 h-3.5 mr-1.5" /> {saving ? "Creating…" : "Create Gmail Draft"}
          </Button>
        </div>
      </div>

      {error && <div className="flex items-center gap-2 p-3 rounded-[var(--r-sm)] bg-[var(--down)]/10 border border-[var(--down)]/20 text-[var(--down)] text-[12.5px]"><AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}</div>}
      {success && <div className="flex items-center gap-2 p-3 rounded-[var(--r-sm)] bg-[var(--up)]/10 border border-[var(--up)]/20 text-[var(--up)] text-[12.5px]"><Mail className="w-3.5 h-3.5 shrink-0" />{success}</div>}

      {/* Canva-matched editor — thick white frame */}
      <div className="rounded-[4px] overflow-hidden shadow-sm" style={{ backgroundColor: "#ffffff", padding: 10, border: "10px solid #ffffff" }}>
        <div style={{ backgroundColor: "#D9780A", padding: 12, borderRadius: 4 }}>
        {/* Header: navy */}
        <div style={{ backgroundColor: "#0F1F3C", padding: "16px 20px 12px 20px" }}>
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <div style={{ fontSize: 10, letterSpacing: 2, color: "rgba(255,255,255,0.9)", textTransform: "uppercase" as const }}>WEEK OF {new Date(data!.weekOf).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }).toUpperCase()}</div>
              <div style={{ height: 2, backgroundColor: "#E88A1A", margin: "6px 0 10px 0" }} />
              <div style={{ fontFamily: "'Arial Black', Arial, sans-serif", fontSize: 26, fontWeight: 900, color: "#ffffff", lineHeight: 1.1, textAlign: "center", whiteSpace: "nowrap" as const }}>ON THE DOCKET THIS WEEK</div>
            </div>
            <div style={{ width: 56, textAlign: "right" as const, paddingLeft: 12 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/h-logo.svg" alt="H" width={56} height={98} style={{ display: "block", width: 56, height: "auto" }} />
            </div>
          </div>
        </div>

        {/* GIF centered, ignoring columns, full width */}
        <div style={{ backgroundColor: "#D9780A", padding: "8px 8px 4px 8px", textAlign: "center" as const }}>
          {gifUrl ? (
            <div className="relative inline-block w-full max-w-[420px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={gifUrl} alt="Weekly GIF" className="w-full h-auto max-h-[200px] object-contain" style={{ display: "block", width: "100%", height: "auto", borderRadius: 12 }} onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
              <input value={gifUrl} onChange={(e) => setGifUrl(e.target.value)} placeholder="Paste GIF URL…" className="absolute bottom-2 left-2 right-2 bg-black/60 backdrop-blur text-white text-[11px] rounded px-2 py-1 border border-white/20 placeholder:text-white/60 focus:outline-none" />
            </div>
          ) : (
            <div className="w-full max-w-[420px] mx-auto min-h-[110px] flex flex-col items-center justify-center p-3 rounded-[12px]" style={{ background: "linear-gradient(135deg,#87CEEB 0%,#E0F6FF 45%,#90EE90 100%)" }}>
              <span className="text-[12px] text-[#334155]">Your GIF will appear here</span>
              <input value={gifUrl} onChange={(e) => setGifUrl(e.target.value)} placeholder="https://media.giphy.com/…  paste GIF URL" className="mt-2 w-full max-w-[280px] bg-white/90 text-[11px] rounded px-2 py-1.5 border border-black/10 placeholder:text-black/40 focus:outline-none" />
            </div>
          )}
        </div>
        {/* Intro centered and wide, navy blue */}
        <div style={{ backgroundColor: "#D9780A", padding: "4px 8px 8px 8px", display: "flex", justifyContent: "center" }}>
          <div style={{ backgroundColor: "#0F1F3C", borderRadius: 12, border: "3px solid #ffffff", padding: "12px 14px", maxWidth: 520, width: "100%" }}>
            <textarea value={introText} onChange={(e) => setIntroText(e.target.value)} rows={4} placeholder="Intro blurb for the week — welcome, shout-outs…&#10;Tip: [label](https://…)" className="w-full bg-white/10 rounded-[8px] px-3 py-2.5 text-white text-[12.5px] placeholder:text-white/40 border border-white/20 focus:outline-none focus:border-white/40 focus:bg-white/15 resize-y" />
          </div>
        </div>

        {/* Two columns */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
          {/* Left column */}
          <div style={{ backgroundColor: "#2A1740", padding: "18px 16px 18px 16px" }}>
            <div className="space-y-4">
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#ffffff", marginBottom: 6, textAlign: "center" as const }}>📚 CURRICULUM ASKS 📚</div>
                <div style={{ height: 1.5, backgroundColor: "#E88A1A", marginBottom: 8 }} />
                <textarea value={curriculumText} onChange={(e) => setCurriculumText(e.target.value)} rows={3} placeholder="What should teachers focus on?&#10;Tip: [label](https://…)" className="w-full bg-white/10 border border-white/15 rounded-[6px] px-3 py-2 text-white text-[12.5px] placeholder:text-white/40 focus:outline-none focus:border-[#E88A1A] resize-y" />
              </div>

              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#ffffff", marginBottom: 6, textAlign: "center" as const }}>💾 DATA ASKS 💾</div>
                <div style={{ height: 1.5, backgroundColor: "#E88A1A", marginBottom: 8 }} />
                <textarea value={dataAsks} onChange={(e) => setDataAsks(e.target.value)} rows={3} placeholder="Data pulls, submissions, deadlines…&#10;Tip: [label](https://…)" className="w-full bg-white/10 border border-white/15 rounded-[6px] px-3 py-2 text-white text-[12.5px] placeholder:text-white/40 focus:outline-none focus:border-[#E88A1A] resize-y" />
              </div>

              <div>
                <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#ffffff", textAlign: "center" as const, flex: 1 }}>🗓️ UPCOMING EVENTS 🗓️</span>
                  {calendars.length > 0 && (
                    <select value={calendarId || "primary"} onChange={(e) => handleCalendarChange(e.target.value)} className="text-[10px] bg-white/15 text-white rounded px-1.5 py-0.5 border border-white/20">
                      {calendars.map((c) => <option key={c.id} value={c.id} className="text-black">{c.summary}{c.primary ? " (primary)" : ""}</option>)}
                      {!calendars.find((c) => c.id === calendarId) && calendarId && <option value={calendarId} className="text-black">{calendarName || calendarId}</option>}
                    </select>
                  )}
                </div>
                <div style={{ height: 1.5, backgroundColor: "#E88A1A", marginBottom: 8 }} />
                {data!.upcomingEvents.length > 0 ? (
                  <div className="rounded-[6px] bg-white/5 border border-white/10 p-2 mb-2 space-y-0.5">
                    {data!.upcomingEvents.slice(0, 10).map((e) => {
                      const hidden = hiddenEventIds.includes(e.id);
                      return (
                        <div key={e.id} className={`text-[11px] py-1 flex gap-2 items-start group ${hidden ? "opacity-40" : "text-white/85"}`}>
                          <span className="shrink-0 mt-0.5">•</span>
                          <span className={`flex-1 ${hidden ? "line-through text-white/50" : ""}`}>{e.title} <span className="text-white/50">— {formatEventDate(e.startISO)}{e.location ? ` @ ${e.location}` : ""}</span></span>
                          <button
                            onClick={() => setHiddenEventIds((prev) => hidden ? prev.filter((id) => id !== e.id) : [...prev, e.id])}
                            title={hidden ? "Show in email" : "Hide from email"}
                            className={`shrink-0 text-[10px] leading-none px-1.5 py-0.5 rounded border ${hidden ? "bg-white/20 text-white border-white/30" : "bg-white/10 text-white/60 border-white/20 opacity-0 group-hover:opacity-100"} hover:bg-white/20 transition`}
                          >
                            {hidden ? "show" : "hide"}
                          </button>
                        </div>
                      );
                    })}
                    {hiddenEventIds.length > 0 && (
                      <div className="flex items-center justify-between pt-1.5 mt-1 border-t border-white/10">
                        <span className="text-[10px] text-white/40">{hiddenEventIds.length} hidden from email</span>
                        <button onClick={() => setHiddenEventIds([])} className="text-[10px] text-[#FBBF24] hover:text-white underline">Show all</button>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-[11px] text-white/40 italic mb-2">No events from {calendarName || "selected calendar"} — they&apos;ll appear here when scheduled.</p>
                )}
              </div>

              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#ffffff", marginBottom: 6, textAlign: "center" as const }}>📌 IMPORTANT LINKS 📌</div>
                <div style={{ height: 1.5, backgroundColor: "#E88A1A", marginBottom: 8 }} />
                <textarea value={importantLinks} onChange={(e) => setImportantLinks(e.target.value)} rows={3} placeholder="Links for the team — one per line&#10;Tip: [Recommitment Form](https://…)" className="w-full bg-white/10 border border-white/15 rounded-[6px] px-3 py-2 text-white text-[12.5px] placeholder:text-white/40 focus:outline-none focus:border-[#E88A1A] resize-y" />
                <p className="text-[10px] text-white/40 mt-1">Supports [label](url) and bare URLs.</p>
              </div>
            </div>
          </div>

          {/* Right column — picture + priorities */}
          <div style={{ backgroundColor: "#D9780A", padding: 0 }} className="flex flex-col">
            {/* Picture space above priorities — upload or URL, scalable & draggable */}
            <div style={{ padding: "8px 8px 0 8px", backgroundColor: "#D9780A" }}>
              {sideImageUrl ? (
                <div className="space-y-2">
                  <div
                    className="relative w-full overflow-hidden rounded-[12px] border-[3px] border-white bg-white"
                    style={{ height: 180, cursor: "grab" }}
                    onMouseDown={(e) => {
                      const startX = e.clientX;
                      const startY = e.clientY;
                      const [sx, sy] = sideImagePos.split(" ").map((p) => parseInt(p));
                      const onMove = (ev: MouseEvent) => {
                        const dx = ((ev.clientX - startX) / 180) * 100;
                        const dy = ((ev.clientY - startY) / 180) * 100;
                        const nx = Math.min(100, Math.max(0, sx + dx));
                        const ny = Math.min(100, Math.max(0, sy + dy));
                        setSideImagePos(`${Math.round(nx)}% ${Math.round(ny)}%`);
                      };
                      const onUp = () => {
                        window.removeEventListener("mousemove", onMove);
                        window.removeEventListener("mouseup", onUp);
                      };
                      window.addEventListener("mousemove", onMove);
                      window.addEventListener("mouseup", onUp);
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={sideImageUrl}
                      alt="Right column"
                      className="w-full h-full object-cover select-none"
                      style={{ objectPosition: sideImagePos, transform: `scale(${sideImageScale / 100})`, transformOrigin: sideImagePos, display: "block" } as React.CSSProperties}
                      draggable={false}
                      onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
                    />
                    <div className="absolute inset-0 pointer-events-none border-[12px] border-transparent" />
                    <label className="absolute bottom-1.5 left-1.5 right-1.5 bg-black/60 backdrop-blur text-white text-[11px] rounded px-2 py-1 border border-white/20 pointer-events-auto flex items-center justify-between gap-2 cursor-pointer">
                      <span className="truncate">{sideImageUrl.startsWith("data:") ? "Uploaded image" : sideImageUrl}</span>
                      <span className="shrink-0 bg-white/20 rounded px-1.5 py-0.5">Change</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          if (f.size > 4 * 1024 * 1024) { alert("Image must be under 4MB"); return; }
                          const img = new window.Image();
                          img.onload = () => {
                            const max = 800;
                            let { width, height } = img;
                            if (width > max || height > max) {
                              const scale = Math.min(max / width, max / height);
                              width = Math.round(width * scale);
                              height = Math.round(height * scale);
                            }
                            const canvas = document.createElement("canvas");
                            canvas.width = width;
                            canvas.height = height;
                            const ctx = canvas.getContext("2d");
                            if (!ctx) return;
                            ctx.drawImage(img, 0, 0, width, height);
                            setSideImageUrl(canvas.toDataURL("image/jpeg", 0.8));
                          };
                          const r = new FileReader();
                          r.onload = () => { img.src = r.result as string; };
                          r.readAsDataURL(f);
                        }}
                      />
                    </label>
                  </div>
                  <div className="bg-white/90 rounded-[8px] p-2 space-y-2 border border-white/60">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-[#6b7280] w-8">Zoom</span>
                      <input type="range" min={50} max={200} value={sideImageScale} onChange={(e) => setSideImageScale(parseInt(e.target.value))} className="flex-1 accent-[#0F1F3C]" />
                      <span className="text-[10px] text-[#6b7280] w-8">{sideImageScale}%</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="flex-1 flex items-center justify-center gap-1.5 bg-white border border-black/10 rounded px-2 py-1 text-[11px] text-[#374151] cursor-pointer hover:bg-gray-50">
                        <span>Upload new</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (!f) return;
                            if (f.size > 4 * 1024 * 1024) { alert("Image must be under 4MB"); return; }
                            const img = new window.Image();
                            img.onload = () => {
                              const max = 800;
                              let { width, height } = img;
                              if (width > max || height > max) {
                                const scale = Math.min(max / width, max / height);
                                width = Math.round(width * scale);
                                height = Math.round(height * scale);
                              }
                              const canvas = document.createElement("canvas");
                              canvas.width = width;
                              canvas.height = height;
                              const ctx = canvas.getContext("2d");
                              if (!ctx) return;
                              ctx.drawImage(img, 0, 0, width, height);
                              setSideImageUrl(canvas.toDataURL("image/jpeg", 0.8));
                            };
                            const r = new FileReader();
                            r.onload = () => { img.src = r.result as string; };
                            r.readAsDataURL(f);
                          }}
                        />
                      </label>
                      <span className="text-[10px] text-[#9ca3af]">or paste URL below</span>
                    </div>
                    <input value={sideImageUrl.startsWith("data:") ? "" : sideImageUrl} onChange={(e) => setSideImageUrl(e.target.value)} placeholder="https://… paste image URL" className="w-full bg-white text-[11px] rounded px-2 py-1.5 border border-black/10 placeholder:text-black/40 focus:outline-none" />
                    <input value={sideImageCaption} onChange={(e) => setSideImageCaption(e.target.value)} placeholder="Caption (one line) — under the photo" className="w-full bg-white text-[11px] rounded px-2 py-1.5 border border-black/10 placeholder:text-black/40 focus:outline-none" />
                    <div className="text-[10px] text-[#9ca3af] text-center">Drag image to reposition • Use slider to zoom</div>
                  </div>
                </div>
              ) : (
                <div className="w-full min-h-[120px] flex flex-col items-center justify-center p-3 rounded-[12px] bg-white border-[3px] border-white">
                  <span className="text-[11px] text-[#6b7280]">Picture for right column</span>
                  <span className="text-[10px] text-[#9ca3af]">Above priorities</span>
                  <label className="mt-2 w-full flex items-center justify-center gap-2 bg-[var(--accent)] text-white text-[11px] rounded px-3 py-1.5 cursor-pointer hover:bg-[var(--accent)]/90">
                    <span>Upload image</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        if (f.size > 4 * 1024 * 1024) { alert("Image must be under 4MB"); return; }
                        const img = new window.Image();
                        img.onload = () => {
                          const max = 800;
                          let { width, height } = img;
                          if (width > max || height > max) {
                            const scale = Math.min(max / width, max / height);
                            width = Math.round(width * scale);
                            height = Math.round(height * scale);
                          }
                          const canvas = document.createElement("canvas");
                          canvas.width = width;
                          canvas.height = height;
                          const ctx = canvas.getContext("2d");
                          if (!ctx) return;
                          ctx.drawImage(img, 0, 0, width, height);
                          setSideImageUrl(canvas.toDataURL("image/jpeg", 0.8));
                        };
                        const r = new FileReader();
                        r.onload = () => { img.src = r.result as string; };
                        r.readAsDataURL(f);
                      }}
                    />
                  </label>
                  <div className="text-[10px] text-[#9ca3af] mt-1">or</div>
                  <input value={sideImageUrl} onChange={(e) => setSideImageUrl(e.target.value)} placeholder="https://… paste image URL" className="mt-1 w-full bg-white text-[11px] rounded px-2 py-1.5 border border-black/10 placeholder:text-black/40 focus:outline-none" />
                  <input value={sideImageCaption} onChange={(e) => setSideImageCaption(e.target.value)} placeholder="Caption (one line) — under the photo" className="mt-1 w-full bg-white text-[11px] rounded px-2 py-1.5 border border-black/10 placeholder:text-black/40 focus:outline-none" />
                </div>
              )}
            </div>

            {/* Yellow priorities bubble — fish scales with this */}
            <div style={{ padding: "10px 10px 6px 10px", flex: 1, display: "flex", flexDirection: "column" as const }}>
              <div style={{ backgroundColor: "#FBBF24", borderRadius: 14, border: "3px solid #ffffff", padding: "12px 14px 12px 14px" }}>
                <div className="flex items-center justify-between mb-2">
                  <span style={{ fontFamily: "'Arial Black', Arial, sans-serif", fontSize: 13, fontWeight: 900, color: "#0F1F3C", letterSpacing: 0.3, textAlign: "center" as const, flex: 1 }}>🔥 PRIORITIES FOR THE WEEK 🔥</span>
                  {(prioritiesText || autoPrioritiesPreview) && (
                    <button
                      onClick={() => setPrioritiesText("")}
                      title={prioritiesText ? "Reset to auto-pulled tasks" : "Refresh auto tasks"}
                      className="flex items-center gap-1 text-[10px] text-[#0F1F3C]/60 hover:text-[#0F1F3C] border border-[#0F1F3C]/20 rounded px-1.5 py-0.5 bg-white/40 shrink-0 ml-2"
                    >
                      <RotateCcw className="w-3 h-3" /> {prioritiesText ? "reset" : "refresh"}
                    </button>
                  )}
                </div>
                <textarea
                  value={prioritiesText !== "" ? prioritiesText : autoPrioritiesPreview}
                  onChange={(e) => setPrioritiesText(e.target.value)}
                  onFocus={(e) => {
                    if (prioritiesText === "" && autoPrioritiesPreview) {
                      // Seed editor with auto text so you edit the pulled tasks directly
                      setPrioritiesText(autoPrioritiesPreview);
                      // move cursor to end next tick
                      setTimeout(() => { const el = e.target; el.selectionStart = el.selectionEnd = el.value.length; }, 0);
                    }
                  }}
                  rows={5}
                  placeholder="No shared high-priority tasks due this week — type priorities manually…"
                  className="w-full bg-white/55 rounded-[8px] px-3 py-2 text-[12.5px] text-[#1e293b] placeholder:text-[#64748b] border border-white/60 focus:outline-none focus:border-white focus:bg-white/75 resize-y"
                />
                <p className="text-[10px] text-[#0F1F3C]/60 mt-1.5">
                  {prioritiesText
                    ? "Custom — edited directly. Click reset to go back to auto-pulled shared tasks."
                    : autoPrioritiesPreview
                      ? `Auto-pulled from ${data!.priorities.length} shared task${data!.priorities.length !== 1 ? "s" : ""} due this week — click to edit, or type to customize.`
                      : "No auto tasks — type priorities manually."}
                </p>
              </div>
              <div style={{ marginLeft: 18, width: 0, height: 0, borderLeft: "12px solid transparent", borderRight: "12px solid transparent", borderTop: "12px solid #FBBF24" }} />
              <div style={{ padding: "6px 0 8px 14px", lineHeight: 1, flex: 1, display: "flex", alignItems: "flex-start" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/fish.png" alt="clownfish" width={fishWidth} height={fishWidth} style={{ display: "block", width: fishWidth, height: "auto", maxWidth: "140px", transition: "width 0.2s ease" }} />
              </div>

              {/* Kudos Korner — right underneath priorities */}
              <div style={{ paddingBottom: 10 }}>
                <div style={{ backgroundColor: "#FBBF24", borderRadius: 14, border: "3px solid #ffffff", padding: "12px 14px 12px 14px" }}>
                  <div style={{ fontFamily: "'Arial Black', Arial, sans-serif", fontSize: 13, fontWeight: 900, color: "#0F1F3C", letterSpacing: 0.3, textAlign: "center" as const, marginBottom: 8 }}>🏆 KUDOS KORNER 🏆</div>
                  <textarea
                    value={kudosText}
                    onChange={(e) => setKudosText(e.target.value)}
                    rows={4}
                    placeholder="Shout-outs, wins, celebrations for the team…"
                    className="w-full bg-white/55 rounded-[8px] px-3 py-2 text-[12.5px] text-[#1e293b] placeholder:text-[#64748b] border border-white/60 focus:outline-none focus:border-white focus:bg-white/75 resize-y"
                  />
                </div>
                <div style={{ marginLeft: 18, width: 0, height: 0, borderLeft: "12px solid transparent", borderRight: "12px solid transparent", borderTop: "12px solid #FBBF24" }} />
              </div>
            </div>
          </div>
        </div>

        {/* Wave footer */}
        <div style={{ backgroundColor: "#0F1F3C", height: 22, display: "flex", alignItems: "center", justifyContent: "center", color: "#0F1F3C", fontSize: 12, letterSpacing: 4 }}>〰〰〰〰〰〰〰〰〰</div>
        </div>
      </div>

      {/* Recipients (not in email body, but for sending) */}
      <div className="panel p-4 flex items-center justify-between">
        <div>
          <div className="text-[12px] font-medium text-[var(--text)]">Recipients · {data!.recipients.length}</div>
          <div className="text-[11px] text-[var(--text-4)]">{data!.recipients.map((r) => r.name).join(" · ")}</div>
        </div>
        <div className="text-[11px] text-[var(--text-4)]">Orange frame is the email border. Everything you type above appears in the draft.</div>
      </div>
    </div>
  );
}
