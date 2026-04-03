"use client";

import { useState, useEffect, useMemo } from "react";
import { AuditionCard } from "@/components/audition/AuditionCard";
import { AuditionFilter } from "@/components/audition/AuditionFilter";
import { Search, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Audition } from "@/types";

export default function HomePage() {
  const [auditions, setAuditions] = useState<Audition[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState("전체");
  const [searchQuery, setSearchQuery] = useState("");
  const supabase = createClient();

  useEffect(() => {
    async function fetchAuditions() {
      const today = new Date().toISOString().split("T")[0];
      const { data, error } = await supabase
        .from("auditions")
        .select("*")
        .eq("is_active", true)
        .or(`deadline.gte.${today},deadline.is.null`)
        .order("deadline", { ascending: true, nullsFirst: false });

      if (!error && data) {
        // 클라이언트 측 이중 필터: 마감된 공고 확실히 제외
        const active = data.filter(
          (a) => !a.deadline || a.deadline >= today
        );
        setAuditions(active);
      }
      setLoading(false);
    }

    fetchAuditions();
  }, [supabase]);

  const filteredAuditions = useMemo(() => {
    let filtered = auditions;

    if (selectedFilter === "원클릭지원") {
      filtered = filtered.filter((a) => a.apply_type === "email");
    } else if (selectedFilter === "사이트지원") {
      filtered = filtered.filter((a) => a.apply_type === "external");
    } else if (selectedFilter !== "전체") {
      filtered = filtered.filter((a) => a.genre === selectedFilter);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase();
      filtered = filtered.filter(
        (a) =>
          a.title.toLowerCase().includes(query) ||
          a.company?.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [auditions, selectedFilter, searchQuery]);

  return (
    <div>
      {/* 검색 바 */}
      <div className="relative mb-4">
        <Search
          size={18}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
        />
        <input
          type="text"
          placeholder="오디션 검색 (제목, 주최사)"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-xl border border-gray-100 bg-white py-2.5 pl-10 pr-4 text-sm placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 shadow-sm transition-shadow"
        />
      </div>

      {/* 장르 필터 */}
      <AuditionFilter selected={selectedFilter} onSelect={setSelectedFilter} />

      {/* 결과 카운트 */}
      {!loading && filteredAuditions.length > 0 && (
        <p className="text-xs text-gray-400 mb-3">
          {filteredAuditions.length}개의 오디션
        </p>
      )}

      {/* 로딩 */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={28} className="animate-spin text-primary" />
        </div>
      ) : filteredAuditions.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {filteredAuditions.map((audition) => (
            <AuditionCard key={audition.id} audition={audition} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <Search size={36} className="mb-3 opacity-40" />
          <p className="text-sm font-medium">검색 결과가 없습니다</p>
          <p className="text-xs mt-1 text-gray-300">다른 키워드로 검색해보세요</p>
        </div>
      )}

      {/* 리스트 하단 안내 */}
      <p className="mt-8 pb-4 text-center text-xs text-gray-300">
        매일 새로운 오디션 공고가 업데이트됩니다
      </p>
    </div>
  );
}
