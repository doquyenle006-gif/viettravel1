import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

export type ToastKind = "success" | "error" | "info";

interface ToastItem {
  id: string;
  kind: ToastKind;
  title?: string;
  message: string;
}

interface ToastApi {
  push: (kind: ToastKind, message: string, title?: string) => void;
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const ICONS: Record<ToastKind, IconName> = {
  success: "check-circle",
  error: "alert",
  info: "info",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef<number[]>([]);

  useEffect(() => () => {
    for (const timer of timers.current) window.clearTimeout(timer);
  }, []);

  const push = useCallback((kind: ToastKind, message: string, title?: string) => {
    const id = crypto.randomUUID();
    setItems((current) => [...current.slice(-3), { id, kind, message, title }]);
    const timer = window.setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id));
    }, 5000);
    timers.current.push(timer);
  }, []);

  const api = useMemo<ToastApi>(() => ({
    push,
    success: (message, title) => push("success", message, title),
    error: (message, title) => push("error", message, title),
    info: (message, title) => push("info", message, title),
  }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-atomic="false">
        {items.map((item) => (
          <div key={item.id} className={`toast toast-${item.kind}`} role={item.kind === "error" ? "alert" : "status"}>
            <Icon name={ICONS[item.kind]} size={20} />
            <div className="toast-body">
              {item.title ? <strong>{item.title}</strong> : null}
              <span>{item.message}</span>
            </div>
            <button
              type="button"
              className="toast-close"
              aria-label="Đóng thông báo"
              onClick={() => setItems((current) => current.filter((toast) => toast.id !== item.id))}
            >
              <Icon name="x" size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast phải nằm trong ToastProvider");
  return context;
}
