"use client";

import { cn } from "@/lib/utils";

const FILTERS = [
  { key: "전체", label: "전체" },
  { key: "원클릭지원", label: "원클릭지원" },
  { key: "사이트지원", label: "사이트지원" },
  { key: "배우", label: "배우" },
  { key: "모델", label: "모델" },
] as const;

interface AuditionFilterProps {
  selected: string;
  onSelect: (genre: string) => void;
}

export function AuditionFilter({ selected, onSelect }: AuditionFilterProps) {
  return (
    <div className="flex gap-1.5 mb-5 overflow-x-auto scrollbar-hide pb-0.5">
      {FILTERS.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => onSelect(key)}
          className={cn(
            "shrink-0 rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition-all duration-200",
            selected === key
              ? "bg-primary text-white shadow-[0_2px_8px_rgba(99,102,241,0.35)]"
              : "bg-white text-gray-500 hover:bg-indigo-50 hover:text-primary border border-gray-100"
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
