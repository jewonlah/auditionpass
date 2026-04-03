"use client";

import { cn } from "@/lib/utils";

const FILTERS = ["전체", "원클릭지원", "사이트지원", "배우", "모델"] as const;

interface AuditionFilterProps {
  selected: string;
  onSelect: (genre: string) => void;
}

export function AuditionFilter({ selected, onSelect }: AuditionFilterProps) {
  return (
    <div className="flex gap-2 mb-4 overflow-x-auto scrollbar-hide">
      {FILTERS.map((filter) => (
        <button
          key={filter}
          onClick={() => onSelect(filter)}
          className={cn(
            "shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
            selected === filter
              ? "bg-primary text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          )}
        >
          {filter}
        </button>
      ))}
    </div>
  );
}
