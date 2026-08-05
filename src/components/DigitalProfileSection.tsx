"use client";

/**
 * Emblem — THE DIGITAL PROFILE section
 * A drag-to-unlock gate followed by a scroll-locked cinematic phone walkthrough.
 *
 * Behaviour:
 *  1. Intro: a physical card + a phone showing the lock screen. Drag the card and
 *     phone together — the lock screen live-swaps to the "Website NFC Tag" notification
 *     the instant they overlap, then docks and boots into the profile.
 *  2. LOCKED GATE: until unlocked, the cinematic stage is display:none so it takes no
 *     space and the visitor can scroll straight past to the next section. No beats reveal.
 *  3. Once unlocked, the stage expands (700vh) and a sticky phone crossfades through 7
 *     "beats". Each beat swaps the phone's screen image and the copy on the left.
 *
 * Self-contained: inline styles + one <style> block for keyframes. No UI deps.
 * Assets expected under /emblem/ (see /public/emblem).
 */

import React, { useEffect, useRef, useState } from "react";

const ORANGE = "#EF6C2F";

type Beat = {
  eyebrow: string;
  title: React.ReactNode;
  screen: string; // image under /emblem/
};

const BEATS: Beat[] = [
  {
    eyebrow: "YOUR SEASON",
    title: (<>Every season<br/>begins here.</>),
    screen: "/emblem/dp-home-screen.png",
  },
  {
    eyebrow: "THE COLLECTION",
    title: (<>Every milestone,<br/>a collectible.</>),
    screen: "/emblem/dp-develop-screen.png",
  },
  {
    eyebrow: "COACH'S ASSESSMENT",
    title: (<>A word from<br/>their coach.</>),
    screen: "/emblem/dp-recognition-screen.png",
  },
  {
    eyebrow: "STORY UPDATES",
    title: (<>Never miss<br/>a moment.</>),
    screen: "/emblem/dp-collection-screen.png",
  },
  {
    eyebrow: "COACH RECOGNITION",
    title: (<>Every player<br/>celebrated.</>),
    screen: "/emblem/dp-celebrate-screen.png",
  },
  {
    eyebrow: "CAPTURE ANYTHING",
    title: (<>Add a moment<br/>in seconds.</>),
    screen: "/emblem/dp-addmoment-screen.png",
  },
  {
    eyebrow: "A SEASON, GROWN",
    title: (<>Chapters that<br/>keep adding up.</>),
    screen: "/emblem/dp-grown-screen.png",
  },
];

const font = {
  cond: "var(--font-jbmono), monospace",
  display: "var(--font-sora), system-ui, sans-serif",
  body: "var(--font-manrope), system-ui, sans-serif",
};

function rectsOverlap(a: DOMRect, b: DOMRect, pad = 0) {
  return !(a.right < b.left - pad || a.left > b.right + pad || a.bottom < b.top - pad || a.top > b.bottom + pad);
}

type LockScreenClock = { time: string; date: string; iso: string };

// Live HH:mm + weekday/day/month for the lock-screen mockup, in the visitor's
// own timezone. Starts null so server render and first client render match
// (no baked-in fake time to hydrate against) — the real value is filled in
// by the effect right after mount, then re-scheduled to the next minute
// boundary rather than polling every second.
function useLockScreenClock(): LockScreenClock | null {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    const tick = () => {
      const current = new Date();
      setNow(current);
      const msUntilNextMinute = 60000 - (current.getSeconds() * 1000 + current.getMilliseconds());
      timeoutId = setTimeout(tick, msUntilNextMinute);
    };
    tick();
    return () => clearTimeout(timeoutId);
  }, []);

  if (!now) return null;

  const pad = (n: number) => String(n).padStart(2, "0");
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const weekday = now.toLocaleDateString("en-GB", { weekday: "long" });
  const month = now.toLocaleDateString("en-GB", { month: "long" });
  const date = `${weekday} ${now.getDate()} ${month}`;
  const iso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${time}`;

  return { time, date, iso };
}

export default function DigitalProfileSection() {
  const [unlocked, setUnlocked] = useState(false);
  const [beat, setBeat] = useState(0);
  const clock = useLockScreenClock();

  const wrapRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLImageElement>(null);
  const phoneRef = useRef<HTMLDivElement>(null);
  const screenRef = useRef<HTMLImageElement>(null);
  const bootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const badgeRef = useRef<HTMLDivElement>(null);

  const drag = useRef<{ x: number; y: number; last: number } | null>(null);
  const dragging = useRef<"card" | "phone" | null>(null);
  const docked = useRef(false);

  // ---- drag unlock -----------------------------------------------------------
  const swapProximity = () => {
    const c = cardRef.current, p = phoneRef.current, s = screenRef.current;
    if (!c || !p || !s || docked.current) return;
    const overlap = rectsOverlap(c.getBoundingClientRect(), p.getBoundingClientRect(), 8);
    const want = overlap ? "/emblem/dp-lock-nfc.png" : "/emblem/dp-lock.png";
    if (!s.src.endsWith(want)) s.src = want;
  };

  const doDock = () => {
    if (docked.current) return;
    docked.current = true;
    const s = screenRef.current, boot = bootRef.current, badge = badgeRef.current, hint = hintRef.current;
    if (s) s.src = "/emblem/dp-lock-nfc.png";
    if (badge) badge.style.display = "none";
    if (hint) hint.style.opacity = "0";
    if (boot) { boot.style.opacity = "1"; setTimeout(() => { boot.style.opacity = "0"; }, 900); }
    setTimeout(() => setUnlocked(true), 700);
  };

  const onDown = (which: "card" | "phone") => (e: React.PointerEvent<HTMLElement>) => {
    if (docked.current) return;
    dragging.current = which;
    drag.current = { x: e.clientX, y: e.clientY, last: 0 };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    const el = e.currentTarget as HTMLElement;
    el.style.transition = "none"; el.style.zIndex = "9"; el.style.cursor = "grabbing";
    if (hintRef.current) hintRef.current.style.opacity = "0";
  };

  const onMove = (which: "card" | "phone") => (e: React.PointerEvent<HTMLElement>) => {
    if (dragging.current !== which || !drag.current) return;
    const el = e.currentTarget as HTMLElement;
    const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
    const vel = dx - drag.current.last; drag.current.last = dx;
    const rot = Math.max(-14, Math.min(14, vel * 0.7));
    const baseY = which === "card" ? "calc(-50% + " + dy + "px)" : dy + "px";
    const baseX = which === "card" ? dx + "px" : dx + "px";
    el.style.transform = "translate(" + baseX + "," + baseY + ") rotate(" + rot.toFixed(1) + "deg)";
    swapProximity();
  };

  const onUp = (which: "card" | "phone") => (e: React.PointerEvent<HTMLElement>) => {
    if (dragging.current !== which || !drag.current) return;
    const el = e.currentTarget as HTMLElement;
    const moved = Math.hypot(e.clientX - drag.current.x, e.clientY - drag.current.y);
    const other = which === "card" ? phoneRef.current : cardRef.current;
    const overlap = !!other && rectsOverlap(el.getBoundingClientRect(), other.getBoundingClientRect(), 12);
    el.style.transition = "transform .55s cubic-bezier(.2,.7,.2,1)"; el.style.cursor = "grab";
    drag.current = null; dragging.current = null;
    if (overlap || moved < 16) { doDock(); }
    else {
      el.style.transform = which === "card" ? "translateY(-50%) rotate(-5deg)" : "translate(0,0) rotate(0deg)";
      if (hintRef.current) hintRef.current.style.opacity = "1";
    }
  };

  // ---- scroll-driven beats (only once unlocked) ------------------------------
  useEffect(() => {
    if (!unlocked) return;
    const st = stageRef.current;
    if (!st) return;
    // reveal + scroll into the stage
    requestAnimationFrame(() => {
      const r = st.getBoundingClientRect();
      window.scrollTo({ top: r.top + window.pageYOffset + 12, behavior: "smooth" });
    });
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const rect = st.getBoundingClientRect();
        const range = st.offsetHeight - window.innerHeight;
        let p = (-rect.top) / range;
        p = Math.max(0, Math.min(0.9999, p));
        setBeat(Math.min(BEATS.length - 1, Math.floor(p * BEATS.length)));
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => { window.removeEventListener("scroll", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [unlocked]);

  const prefersReduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  return (
    <section id="digital-profile" style={{ background: "#080808", borderTop: "1px solid rgba(255,255,255,.07)" }}>
      <style>{`
        @keyframes emNfcRing{0%{transform:scale(.6);opacity:.7}100%{transform:scale(1.9);opacity:0}}
        @keyframes emSpin{to{transform:rotate(360deg)}}
        @keyframes emTapPulse{0%,100%{transform:translate(-50%,-50%) scale(1)}50%{transform:translate(-50%,-50%) scale(1.05)}}
        @media (max-width:820px){
          #dp-intro{grid-template-columns:1fr !important;text-align:center}
          #dp-pin-inner{grid-template-columns:1fr !important;grid-template-rows:none !important;gap:20px !important;text-align:center}
          #dp-stage{height:520vh !important}
          #dp-copy{grid-column:1 !important;grid-row:auto !important;min-height:150px !important}
          #dp-phone{grid-column:1 !important;grid-row:auto !important;min-height:auto !important}
          #dp-phone-bezel{width:min(230px,58vw) !important;height:auto !important;aspect-ratio:296/604 !important;padding:8px !important;border-radius:32px !important}
          #dp-progress{grid-column:1 !important;grid-row:auto !important;justify-content:center !important;margin-top:20px !important}
        }
      `}</style>

      {/* ---- INTRO / DRAG-TO-UNLOCK ---- */}
      <div id="dp-intro" style={{ maxWidth: 1200, margin: "0 auto", padding: "56px 26px 28px", display: "grid", gridTemplateColumns: ".8fr 1.2fr", gap: 40, alignItems: "center" }}>
        <div>
          <div style={{ fontFamily: font.cond, fontWeight: 700, letterSpacing: ".24em", fontSize: 13, color: ORANGE, marginBottom: 16 }}>THE DIGITAL PROFILE</div>
          <h2 style={{ fontFamily: font.display, fontWeight: 900, fontSize: "clamp(40px,5.5vw,64px)", lineHeight: .96, letterSpacing: "-.01em", margin: "0 0 20px", textTransform: "none", color: "#F4F0E9" }}>
            Their season<br /><span style={{ color: ORANGE }}>lives here.</span>
          </h2>
          <p style={{ fontFamily: font.body, fontSize: 17, lineHeight: 1.65, color: "#AAA39A", margin: "0 0 26px", maxWidth: 420 }}>
            Every tap opens a private digital profile that grows throughout the season. New matches, memories and milestones are added as their football story unfolds.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 18, color: "#8B8478", fontSize: 13, fontFamily: font.body }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8B8478" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6z" /></svg>
            Private. Secure. Always theirs.
          </div>
        </div>

        <div ref={wrapRef} style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "flex-end", minHeight: 460, paddingRight: 6 }}>
          <img
            ref={cardRef}
            onPointerDown={onDown("card")} onPointerMove={onMove("card")} onPointerUp={onUp("card")}
            src="/emblem/card-slab-graded.png" alt="Physical Emblem player card" draggable={false}
            style={{ position: "absolute", left: 0, top: "50%", transform: "translateY(-50%) rotate(-5deg)", height: 262, width: "auto", filter: "drop-shadow(0 24px 44px rgba(0,0,0,.65))", zIndex: 1, cursor: "grab", touchAction: "none", userSelect: "none" }}
          />
          <div style={{ position: "absolute", left: "36%", top: "50%", transform: "translateY(-50%)", width: 60, height: 60, zIndex: 2, pointerEvents: "none" }}>
            <span style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "2px solid rgba(239,108,47,.65)", animation: "emNfcRing 2s ease-out infinite" }} />
            <span style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "2px solid rgba(239,108,47,.45)", animation: "emNfcRing 2s ease-out .7s infinite" }} />
          </div>

          <div ref={phoneRef}
            onPointerDown={onDown("phone")} onPointerMove={onMove("phone")} onPointerUp={onUp("phone")}
            style={{ position: "relative", zIndex: 3, marginLeft: "auto", cursor: "grab", touchAction: "none", userSelect: "none", filter: "drop-shadow(0 34px 64px rgba(0,0,0,.7))" }}>
            <img ref={screenRef} src="/emblem/dp-lock.png" alt="Emblem card — tap to unlock" draggable={false} style={{ display: "block", height: 500, width: "auto", pointerEvents: "none", borderRadius: 34 }} />
            {/* Live lock-screen clock. The static screenshots have a baked-in
                placeholder time/date at this position — this scrim sits over
                that exact band to keep it legible-but-hidden behind the real,
                ticking time, the same way iOS itself darkens bright wallpaper
                behind the lock-screen clock. */}
            <div style={{ position: "absolute", top: "6%", left: 0, right: 0, height: "23%", borderRadius: 34, background: "linear-gradient(180deg, rgba(3,7,15,0) 0%, rgba(3,7,15,.6) 16%, rgba(3,7,15,.86) 38%, rgba(3,7,15,.86) 64%, rgba(3,7,15,.55) 84%, rgba(3,7,15,0) 100%)", pointerEvents: "none", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}>
              {clock && (
                <>
                  <time dateTime={clock.iso} style={{ fontFamily: font.body, fontSize: 14, fontWeight: 500, color: "#F1EFEA", letterSpacing: ".01em" }}>
                    {clock.date}
                  </time>
                  <time dateTime={clock.iso} style={{ fontFamily: font.body, fontSize: 58, fontWeight: 600, letterSpacing: "-.02em", color: "#FDFDFB", lineHeight: 1 }}>
                    {clock.time}
                  </time>
                </>
              )}
            </div>
            <div ref={bootRef} style={{ position: "absolute", inset: 0, borderRadius: 34, background: "#050505", opacity: 0, pointerEvents: "none", transition: "opacity .35s ease", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14 }}>
              <img src="/emblem/emblem-wordmark.png" alt="" style={{ height: 22, width: "auto", filter: "brightness(0) invert(1)", opacity: .9 }} />
              <div style={{ width: 26, height: 26, borderRadius: "50%", border: "2.5px solid rgba(239,108,47,.3)", borderTopColor: ORANGE, animation: "emSpin .8s linear infinite" }} />
            </div>
            <div ref={badgeRef} style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", pointerEvents: "none", display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(11,10,9,.72)", backdropFilter: "blur(4px)", border: "1px solid rgba(239,108,47,.55)", borderRadius: 22, padding: "10px 16px", fontFamily: font.body, fontWeight: 800, fontSize: 13, color: "#F4F1EC", boxShadow: "0 10px 26px -10px rgba(0,0,0,.7)", animation: prefersReduced ? "none" : "emTapPulse 1.8s ease-in-out infinite" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={ORANGE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20" /></svg>
              Drag to the card
            </div>
            <div ref={hintRef} style={{ position: "absolute", left: "50%", bottom: -30, transform: "translateX(-50%)", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 7, fontFamily: font.cond, fontWeight: 700, letterSpacing: ".08em", fontSize: 11, textTransform: "uppercase", color: "#8B8478", transition: "opacity .3s ease" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={ORANGE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20" /></svg>
              Drag the phone to the card
            </div>
          </div>
        </div>
      </div>

      {/* ---- CINEMATIC SCROLL STAGE (locked/hidden until unlocked) ---- */}
      <div id="dp-stage" ref={stageRef} style={{ position: "relative", height: "700vh", display: unlocked ? "block" : "none" }}>
        <div style={{ position: "sticky", top: 0, height: "100vh", display: "flex", alignItems: "center", overflow: "hidden" }}>
          <div id="dp-pin-inner" style={{ maxWidth: 1160, width: "100%", margin: "0 auto", padding: "0 26px", display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "auto auto", gap: 40, alignItems: "center" }}>
            {/* COPY — eyebrow + heading only (no paragraph in this carousel) */}
            <div id="dp-copy" style={{ position: "relative", minHeight: 150, gridColumn: 1, gridRow: 1 }}>
              {BEATS.map((b, i) => (
                <div key={i} style={{ position: "absolute", inset: 0, opacity: beat === i ? 1 : 0, transform: beat === i ? "translateY(0)" : "translateY(14px)", transition: "opacity .5s ease, transform .5s ease", pointerEvents: beat === i ? "auto" : "none" }}>
                  <div style={{ fontFamily: font.cond, fontWeight: 700, letterSpacing: ".24em", fontSize: 13, color: ORANGE, marginBottom: 16 }}>{b.eyebrow}</div>
                  <h3 style={{ fontFamily: font.display, fontWeight: 900, fontSize: "clamp(34px,4.4vw,52px)", lineHeight: .98, letterSpacing: "-.01em", margin: 0, textTransform: "none", color: "#F4F0E9" }}>{b.title}</h3>
                </div>
              ))}
            </div>

            {/* PHONE — one shared bezel, screen crossfades */}
            <div id="dp-phone" style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 640, gridColumn: 2, gridRow: "1 / 3" }}>
              <div id="dp-phone-bezel" style={{ position: "relative", zIndex: 3, width: 296, height: 604, borderRadius: 44, background: "#0a0a0a", border: "1px solid #1e1e1e", padding: 11, boxShadow: "0 40px 80px -30px rgba(0,0,0,.85), inset 0 0 0 2px #000" }}>
                <div style={{ position: "absolute", top: 20, left: "50%", transform: "translateX(-50%)", width: 104, height: 26, background: "#000", borderRadius: 16, zIndex: 20 }} />
                <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: 34, overflow: "hidden", background: "#EDECE7" }}>
                  {BEATS.map((b, i) => (
                    <img key={i} src={b.screen} alt={b.eyebrow + " screen"} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center", opacity: beat === i ? 1 : 0, transition: "opacity .55s ease" }} />
                  ))}
                </div>
              </div>
            </div>

            {/* PROGRESS — its own grid item so it can sit under the phone on mobile
                instead of overlapping it (it used to be absolutely positioned
                below #dp-copy, which only worked while the phone was a separate
                side-by-side column). */}
            <div id="dp-progress" style={{ display: "flex", gap: 9, gridColumn: 1, gridRow: 2, marginTop: 28 }}>
              {BEATS.map((_, i) => (
                <span key={i} style={{ width: 26, height: 4, borderRadius: 3, background: beat === i ? ORANGE : "rgba(255,255,255,.16)", transition: "background .3s ease" }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
