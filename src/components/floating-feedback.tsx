"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Kind = "success" | "error" | "warning";
type Notice = { id: number; message: string; kind: Kind };
const FeedbackContext = createContext<(message: string, kind?: Kind) => void>(() => {});

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const sequence = useRef(0);
  const notify = useCallback((message: string, kind: Kind = "error") => {
    if (!message.trim()) return;
    const id = ++sequence.current;
    setNotices((previous) => [...previous.filter((item) => item.message !== message), { id, message, kind }].slice(-3));
  }, []);
  const dismiss = useCallback((id: number) => setNotices((previous) => previous.filter((item) => item.id !== id)), []);
  return <FeedbackContext.Provider value={notify}>
    <div onInvalidCapture={(event) => {
      const field = event.target as HTMLInputElement;
      field.setAttribute("aria-invalid", "true");
      notify(field.validationMessage || "Confira o campo destacado.", "warning");
    }} onInputCapture={(event) => {
      const field = event.target as HTMLInputElement;
      if (field.validity?.valid) field.removeAttribute("aria-invalid");
    }}>{children}</div>
    {notices.length > 0 && createPortal(<div aria-label="Notificações do sistema" className="pointer-events-none fixed inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[100] mx-auto flex max-w-lg flex-col gap-2">
      {notices.map((notice) => <Toast key={notice.id} notice={notice} dismiss={dismiss} />)}
    </div>, document.body)}
  </FeedbackContext.Provider>;
}
function Toast({ notice, dismiss }: { notice: Notice; dismiss: (id: number) => void }) {
  useEffect(() => {
    if (notice.kind === "error") return;
    const timer = window.setTimeout(() => dismiss(notice.id), notice.kind === "success" ? 6000 : 10000);
    return () => window.clearTimeout(timer);
  }, [notice, dismiss]);
  return <div role={notice.kind === "success" ? "status" : "alert"} aria-atomic="true" className={`pointer-events-auto flex items-start gap-3 rounded-xl border bg-white p-4 shadow-xl ${notice.kind === "success" ? "border-green-600 text-green-800" : notice.kind === "warning" ? "border-amber-500 text-amber-900" : "border-red-500 text-red-800"}`}>
    <div className="min-w-0 flex-1"><p className="font-semibold">{notice.kind === "success" ? "Concluído" : notice.kind === "warning" ? "Confira os dados" : "Não foi possível concluir"}</p><p className="mt-1 break-words text-sm">{notice.message}</p></div>
    <button type="button" aria-label="Fechar notificação" onClick={() => dismiss(notice.id)} className="min-h-11 min-w-11 rounded text-xl">×</button>
  </div>;
}
export function useActionFeedback(state: { ok: boolean; message: string }) {
  const notify = useContext(FeedbackContext);
  useEffect(() => { if (state.message) notify(state.message, state.ok ? "success" : "error"); }, [state, notify]);
}
export function ActionFeedback({ state }: { state: { ok: boolean; message: string } }) {
  useActionFeedback(state);
  return null;
}
export function FloatingMessage({ message, kind = "error" }: { message?: string | null; kind?: Kind }) {
  const notify = useContext(FeedbackContext);
  useEffect(() => { if (message) notify(message, kind); }, [message, kind, notify]);
  return null;
}
