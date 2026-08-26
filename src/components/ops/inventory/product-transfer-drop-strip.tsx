"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

type TargetShelf = { id: string; name: string };

type Props = {
  targets: TargetShelf[];
  busyTargetId: string | null;
  productName: string;
  onDropTarget: (targetLocationId: string, targetName: string) => void;
  onDragEnd: () => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

export function ProductTransferDropStrip({
  targets,
  busyTargetId,
  productName,
  onDropTarget,
  onDragEnd,
  t,
}: Props) {
  const [hoverId, setHoverId] = useState<string | null>(null);

  if (targets.length === 0) return null;

  return (
    <div
      className="shrink-0 border-t border-[#6c4cff]/30 bg-[#f5f3ff]/95 px-2 py-2 backdrop-blur-sm"
      dir="rtl"
      onDragEnd={() => {
        setHoverId(null);
        onDragEnd();
      }}
    >
      <p className="mb-2 text-center text-[11px] font-black text-[#6c4cff]">
        {t("dropStripHint", { name: productName })}
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
        {targets.map((shelf) => {
          const active = hoverId === shelf.id;
          const busy = busyTargetId === shelf.id;
          return (
            <div
              key={shelf.id}
              data-transfer-drop={shelf.id}
              onDragEnter={(e) => {
                e.preventDefault();
                setHoverId(shelf.id);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setHoverId(shelf.id);
              }}
              onDragLeave={() => setHoverId((prev) => (prev === shelf.id ? null : prev))}
              onDrop={(e) => {
                e.preventDefault();
                setHoverId(null);
                if (busy) return;
                onDropTarget(shelf.id, shelf.name);
              }}
              className={`flex min-h-[4.5rem] min-w-[9rem] shrink-0 flex-col items-center justify-center rounded-2xl border-2 border-dashed px-3 py-3 text-center transition-all ${
                active
                  ? "border-[#6c4cff] bg-white shadow-md ring-2 ring-[#6c4cff]/40 scale-[1.02]"
                  : "border-[#6c4cff]/40 bg-white/80 hover:border-[#6c4cff] hover:bg-white"
              } ${busy ? "opacity-70" : "cursor-copy"}`}
            >
              {busy ? (
                <Loader2 className="h-5 w-5 animate-spin text-[#6c4cff]" aria-hidden />
              ) : (
                <>
                  <span className="text-[10px] font-bold text-[#6c4cff]">{t("dropHere")}</span>
                  <span className="mt-1 line-clamp-2 text-xs font-black leading-tight text-slate-800">
                    {shelf.name}
                  </span>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
