"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AlertTriangle, CircleAlert, Info } from "lucide-react";

type Tone = "info" | "danger" | "error";

type BaseOptions = {
  title: string;
  message?: React.ReactNode;
  tone?: Tone;
};
type AlertOptions = BaseOptions & { okLabel?: string };
type ConfirmOptions = BaseOptions & { confirmLabel?: string; cancelLabel?: string };
type PromptOptions = BaseOptions & {
  label?: string;
  defaultValue?: string;
  placeholder?: string;
  multiline?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
};

type Request =
  | { kind: "alert"; opts: AlertOptions; resolve: (v: void) => void }
  | { kind: "confirm"; opts: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: "prompt"; opts: PromptOptions; resolve: (v: string | null) => void };

type DialogApi = {
  alert: (opts: AlertOptions | string) => Promise<void>;
  confirm: (opts: ConfirmOptions | string) => Promise<boolean>;
  prompt: (opts: PromptOptions) => Promise<string | null>;
};

const DialogContext = createContext<DialogApi | null>(null);

/** Themed replacement for window.alert / confirm / prompt. */
export function useDialog(): DialogApi {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useDialog must be used inside <DialogProvider>");
  return ctx;
}

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<Request[]>([]);
  const push = useCallback((req: Request) => setQueue((q) => [...q, req]), []);

  const api = useRef<DialogApi>({
    alert: (o) =>
      new Promise((resolve) => push({ kind: "alert", opts: typeof o === "string" ? { title: o } : o, resolve })),
    confirm: (o) =>
      new Promise((resolve) => push({ kind: "confirm", opts: typeof o === "string" ? { title: o } : o, resolve })),
    prompt: (o) => new Promise((resolve) => push({ kind: "prompt", opts: o, resolve })),
  }).current;

  const current = queue[0];
  const close = (value: unknown) => {
    if (!current) return;
    (current.resolve as (v: unknown) => void)(value);
    setQueue((q) => q.slice(1));
  };

  return (
    <DialogContext.Provider value={api}>
      {children}
      {current && <DialogView key={queue.length + current.opts.title} req={current} onClose={close} />}
    </DialogContext.Provider>
  );
}

const TONE = {
  info: { icon: Info, iconWrap: "bg-blue-50 text-blue-600", button: "bg-blue-600 hover:bg-blue-700 focus-visible:ring-blue-500" },
  danger: { icon: AlertTriangle, iconWrap: "bg-red-50 text-red-600", button: "bg-red-600 hover:bg-red-700 focus-visible:ring-red-500" },
  error: { icon: CircleAlert, iconWrap: "bg-red-50 text-red-600", button: "bg-slate-900 hover:bg-slate-800 focus-visible:ring-slate-500" },
} as const;

function DialogView({ req, onClose }: { req: Request; onClose: (value: unknown) => void }) {
  const { opts, kind } = req;
  const tone = TONE[opts.tone ?? (kind === "alert" ? "error" : "info")];
  const Icon = tone.icon;
  const [value, setValue] = useState(kind === "prompt" ? req.opts.defaultValue ?? "" : "");
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const okRef = useRef<HTMLButtonElement>(null);

  const cancelValue = kind === "confirm" ? false : kind === "prompt" ? null : undefined;
  const submit = () => onClose(kind === "confirm" ? true : kind === "prompt" ? value : undefined);

  useEffect(() => {
    if (kind === "prompt") {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else okRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose(cancelValue);
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const okLabel =
    kind === "alert" ? req.opts.okLabel ?? "OK" : (req.opts as ConfirmOptions).confirmLabel ?? (kind === "prompt" ? "Save" : "Confirm");
  const cancelLabel = kind === "alert" ? null : (req.opts as ConfirmOptions).cancelLabel ?? "Cancel";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]" onClick={() => onClose(cancelValue)} aria-hidden />
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-dialog-title"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="relative w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-xl p-5 space-y-4"
      >
        <div className="flex gap-3">
          <div className={`shrink-0 h-9 w-9 rounded-xl flex items-center justify-center ${tone.iconWrap}`}>
            <Icon size={18} />
          </div>
          <div className="min-w-0 flex-1 pt-1 space-y-1.5">
            <h2 id="app-dialog-title" className="font-semibold text-slate-900 leading-snug">
              {opts.title}
            </h2>
            {opts.message && <div className="text-sm text-slate-600 break-words">{opts.message}</div>}
          </div>
        </div>

        {kind === "prompt" && (
          <label className="block text-xs font-semibold text-slate-700">
            {req.opts.label}
            {req.opts.multiline ? (
              <textarea
                ref={inputRef}
                rows={3}
                value={value}
                placeholder={req.opts.placeholder}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    submit();
                  }
                }}
                className="mt-1 w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
              />
            ) : (
              <input
                ref={inputRef}
                type="text"
                value={value}
                placeholder={req.opts.placeholder}
                onChange={(e) => setValue(e.target.value)}
                className="mt-1 w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
              />
            )}
          </label>
        )}

        <div className="flex justify-end gap-2.5 pt-1">
          {cancelLabel && (
            <button
              type="button"
              onClick={() => onClose(cancelValue)}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50"
            >
              {cancelLabel}
            </button>
          )}
          <button
            ref={okRef}
            type="submit"
            className={`px-4 py-2 text-sm font-medium text-white rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${tone.button}`}
          >
            {okLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
