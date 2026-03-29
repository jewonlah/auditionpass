"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface ApplyLimitState {
  canApply: boolean;
  count: number;
  adBonus: number;
  loading: boolean;
}

export function useApplyLimit(userId: string | undefined) {
  const [state, setState] = useState<ApplyLimitState>({
    canApply: false,
    count: 0,
    adBonus: 0,
    loading: true,
  });
  const supabase = createClient();

  useEffect(() => {
    if (!userId) {
      setState((prev) => ({ ...prev, loading: false }));
      return;
    }

    async function checkLimit() {
      const { data } = await supabase.rpc("can_apply_today", {
        p_user_id: userId,
      });

      const today = new Date().toISOString().split("T")[0];
      const { data: dailyCount } = await supabase
        .from("daily_apply_count")
        .select("count, ad_bonus")
        .eq("user_id", userId)
        .eq("apply_date", today)
        .single();

      setState({
        canApply: data ?? true,
        count: dailyCount?.count ?? 0,
        adBonus: dailyCount?.ad_bonus ?? 0,
        loading: false,
      });
    }

    checkLimit();
  }, [userId, supabase]);

  return state;
}
