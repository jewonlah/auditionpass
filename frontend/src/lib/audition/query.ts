import type { SupabaseClient } from "@supabase/supabase-js";
import { AUDITION_LIST_COLUMNS } from "./columns";
import { categoryFilter, searchFilter } from "./filters";
import { todayKST } from "@/lib/utils";
import type { Audition } from "@/types";

export async function fetchAuditions(db: SupabaseClient, options: {
  filter: string; search: string; category?: string; sort?: "deadline" | "latest"; page?: number; limit?: number; signal?: AbortSignal;
}): Promise<Audition[]> {
  const { filter, search, category, sort = "deadline", page = 0, limit = 20, signal } = options;
  let query = db.from("public_auditions").select(AUDITION_LIST_COLUMNS).eq("is_active", true)
    .or(`deadline.gte.${todayKST()},deadline.is.null`);
  const matching = categoryFilter(category ? [category] : [filter]);
  if (matching) query = query.or(matching);
  if (filter === "원클릭지원") query = query.eq("application_ready", true);
  if (filter === "사이트지원") query = query.eq("apply_type", "external");
  const searchMatch = searchFilter(search);
  if (searchMatch) query = query.or(searchMatch);
  query = sort === "latest" ? query.order("created_at", { ascending: false }) : query.order("deadline", { ascending: true, nullsFirst: false });
  query = query.order("id").range(page * limit, page * limit + limit - 1);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw new Error("공고를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
  return (data ?? []).map((a) => ({ ...a, apply_email: null }) as Audition);
}
