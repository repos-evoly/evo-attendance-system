import type { ReactNode } from "react";
import {
  Inbox,
  LoaderCircle,
  RefreshCw,
  TriangleExclamationPoint,
} from "lucide-react";

/**
 * Shared loading / empty / error panels for the report surfaces.
 * They keep the glass card look consistent across Home, Daily and Monthly.
 */

export function ReportLoadingState({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <LoaderCircle size={26} className="animate-spin text-violet-500" />
      <p className="text-sm text-slate-500">{message ?? "Loading…"}</p>
    </div>
  );
}

export function ReportEmptyState({
  title,
  message,
  icon,
}: {
  title: string;
  message?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-50 text-violet-500">
        {icon ?? <Inbox size={22} />}
      </span>
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {message && <p className="max-w-xs text-xs text-slate-500">{message}</p>}
    </div>
  );
}

export function ReportErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-500">
        <TriangleExclamationPoint size={22} />
      </span>
      <p className="text-sm font-medium text-slate-700">
        Could not load this report
      </p>
      <p className="max-w-sm text-xs text-slate-500">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-violet-700"
        >
          <RefreshCw size={14} />
          Try again
        </button>
      )}
    </div>
  );
}
