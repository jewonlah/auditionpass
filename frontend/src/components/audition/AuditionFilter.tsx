"use client";

import { cn } from "@/lib/utils";

const GENRES = ["전체", "배우", "모델"] as const;

interface AuditionFilterProps {
  selected: string;
  onSelect: (genre: string) => void;
}

export function AuditionFilter({ selected, onSelect }: AuditionFilterProps) {
  return (
    <div className="flex gap-2 mb-4">
      {GENRES.map((genre) => (
        <button
          key={genre}
          onClick={() => onSelect(genre)}
          className={cn(
            "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
            selected === genre
              ? "bg-primary text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          )}
        >
          {genre}
        </button>
      ))}
    </div>
  );
}
