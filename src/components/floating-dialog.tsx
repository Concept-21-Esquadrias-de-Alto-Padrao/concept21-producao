"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

export function FloatingDialog({ title, children, onClose, busy = false }: { title: string; children: React.ReactNode; onClose: () => void; busy?: boolean }) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  useEffect(() => { closeRef.current = onClose; busyRef.current = busy; }, [onClose, busy]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const viewport = window.visualViewport;
    const fitViewport = () => { if (overlayRef.current && viewport) { overlayRef.current.style.height = `${viewport.height}px`; overlayRef.current.style.top = `${viewport.offsetTop}px`; } };
    fitViewport();
    viewport?.addEventListener("resize", fitViewport);
    viewport?.addEventListener("scroll", fitViewport);
    ref.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); if (!busyRef.current) closeRef.current(); }
      if (event.key !== "Tab") return;
      const nodes = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]') ?? []).filter((node) => node.getClientRects().length);
      const first = nodes[0]; const last = nodes.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { viewport?.removeEventListener("resize", fitViewport); viewport?.removeEventListener("scroll", fitViewport); document.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; previous?.focus({ preventScroll: true }); };
  }, []);
  return createPortal(<div ref={overlayRef} className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-2 sm:items-center sm:p-6" onClick={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="max-h-full w-full max-w-2xl overflow-y-auto overscroll-contain rounded-xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl outline-none">
      <div className="mb-4 flex items-center justify-between gap-3"><h2 id={titleId} className="text-lg font-semibold">{title}</h2><button type="button" aria-label="Fechar janela" disabled={busy} onClick={onClose} className="min-h-11 min-w-11 rounded border border-border text-xl">×</button></div>
      {children}
    </div>
  </div>, document.body);
}
