"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

// Portal avoids transformed page containers changing the fixed positioning.
export function SelectionToolbar({ active, label, children }: { active: boolean; label: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const marker = useRef<HTMLSpanElement>(null);
  const [mounted, setMounted] = useState(false);
  const [height, setHeight] = useState(0);
  useEffect(() => { const timer = setTimeout(() => setMounted(true), 0); return () => clearTimeout(timer); }, []);
  useEffect(() => {
    if (!mounted || !ref.current) return;
    const observer = new ResizeObserver(([entry]) => setHeight(entry.target.getBoundingClientRect().height));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [mounted]);
  useEffect(() => {
    const container = marker.current?.parentElement;
    if (!container) return;
    const previous = container.style.paddingBottom;
    container.style.paddingBottom = active ? `${height + 24}px` : previous;
    return () => { container.style.paddingBottom = previous; };
  }, [active, height]);
  return <>
    <span ref={marker} hidden />
    {mounted && createPortal(
      <div ref={ref} role="toolbar" aria-label={label} inert={!active}
        className={`selection-toolbar fixed inset-x-3 bottom-3 z-40 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-white p-3 shadow-xl md:left-[19rem] md:right-4 ${active ? "is-active" : ""}`}>
        {children}
      </div>, document.body)}
  </>;
}
