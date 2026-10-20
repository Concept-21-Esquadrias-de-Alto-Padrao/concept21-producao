"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Kind = "success" | "error" | "warning";
type Notice = { id: number; message: string; kind: Kind; closing?: boolean };
const FeedbackContext = createContext<(message: string, kind?: Kind) => void>(() => {});

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const sequence = useRef(0);
  const notify = useCallback((message: string, kind: Kind = "error") => {
    if (!message.trim()) return;
    const id = ++sequence.current;
    setNotices((previous) => [...previous.map((item) => ({ ...item, closing: true })), { id, message, kind }].slice(-3));
  }, []);
  const dismiss = useCallback((id: number) => setNotices((previous) => previous.filter((item) => item.id !== id)), []);
  return <FeedbackContext.Provider value={notify}>
    <div onInvalidCapture={(event) => {
      const field = event.target as HTMLInputElement;
      field.setAttribute("aria-invalid", "true");
      let hint = field.parentElement?.querySelector<HTMLElement>("[data-native-error]");
      if (!hint) {
        hint = document.createElement("span");
        hint.dataset.nativeError = "true";
        hint.className = "mt-1 block text-sm text-red-700";
        field.insertAdjacentElement("afterend", hint);
      }
      hint.textContent = field.validationMessage;
      notify(field.validationMessage || "Confira o campo destacado.", "warning");
    }} onSubmitCapture={() => setNotices((previous) => previous.map((item) => ({ ...item, closing: true })))} onInputCapture={(event) => {
      const field = event.target as HTMLInputElement;
      if (field.validity?.valid) {
        field.parentElement?.querySelector("[data-native-error]")?.remove();
        if (!field.dataset.serverInvalid) field.removeAttribute("aria-invalid");
      }
    }}>{children}</div>
    {notices.length > 0 && createPortal(<div aria-label="Notificações do sistema" className="pointer-events-none fixed inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[100] mx-auto flex max-w-lg flex-col gap-2">
      {notices.map((notice) => <Toast key={notice.id} notice={notice} dismiss={dismiss} />)}
    </div>, document.body)}
  </FeedbackContext.Provider>;
}
function Toast({ notice, dismiss }: { notice: Notice; dismiss: (id: number) => void }) {
  const [leaving, setLeaving] = useState(false);
  const closing = leaving || notice.closing;
  useEffect(() => {
    const timer = window.setTimeout(() => setLeaving(true), 6000);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(() => dismiss(notice.id), 300);
    return () => window.clearTimeout(timer);
  }, [closing, notice.id, dismiss]);
  return <div role={notice.kind === "success" ? "status" : "alert"} aria-atomic="true" className={`feedback-toast ${closing ? "is-leaving" : ""} pointer-events-auto flex items-start gap-3 rounded-xl border bg-white p-4 shadow-xl ${notice.kind === "success" ? "border-green-600 text-green-800" : notice.kind === "warning" ? "border-amber-500 text-amber-900" : "border-red-500 text-red-800"}`}>
    <div className="min-w-0 flex-1"><p className="font-semibold">{notice.kind === "success" ? "Concluído" : notice.kind === "warning" ? "Confira os dados" : "Não foi possível concluir"}</p><p className="mt-1 break-words text-sm">{notice.message}</p></div>
    <button type="button" aria-label="Fechar notificação" onClick={() => setLeaving(true)} className="min-h-11 min-w-11 rounded text-xl">×</button>
  </div>;
}
export function useActionFeedback(state: { ok: boolean; message: string }) {
  const notify = useContext(FeedbackContext);
  useEffect(() => { if (state.message) notify(state.message, state.ok ? "success" : "error"); }, [state, notify]);
}
export function ActionFeedback({ state }: { state: { ok: boolean; message: string } }) {
  useActionFeedback(state);
  return <FieldFeedback state={state} />;
}
export function FloatingMessage({ message, kind = "error" }: { message?: string | null; kind?: Kind }) {
  const notify = useContext(FeedbackContext);
  useEffect(() => { if (message) notify(message, kind); }, [message, kind, notify]);
  return null;
}

// Server validation stays visible independently of the transient notification.
export function FieldFeedback({ state }: { state: { ok: boolean; message: string } }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const id = useId();
  const message = !state.ok && /matrícula|senha|pin|credencia|e-mail/i.test(state.message) ? state.message : "";
  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const fields = Array.from(form.querySelectorAll<HTMLInputElement>('input[name="operator_registration"], input[name="operator_pin"], input[type="email"], input[type="password"]'));
    for (const field of fields) {
      if (message) {
        field.dataset.serverInvalid = "true";
        field.setAttribute("aria-invalid", "true");
        field.setAttribute("aria-describedby", id);
      }
    }
    return () => { for (const field of fields) {
      if (field.getAttribute("aria-describedby") === id) {
        delete field.dataset.serverInvalid;
        field.removeAttribute("aria-invalid");
        field.removeAttribute("aria-describedby");
      }
    } };
  }, [message, id]);
  return <p ref={ref} id={id} className={message ? "text-sm font-medium text-red-700" : "hidden"}>{message}</p>;
}
