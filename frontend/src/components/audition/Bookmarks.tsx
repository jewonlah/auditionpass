"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bookmark } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/ui/Toast";
import { withReturnTo } from "@/lib/utils";

type BookmarksApi = { ids: Set<string>; pending: Set<string>; loading: boolean; toggle: (id: string) => void; reload: () => void; error: boolean };
const Context = createContext<BookmarksApi | null>(null);

export function BookmarksProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [version, setVersion] = useState(0);
  const busy = useRef(new Set<string>());
  const userId = user?.id;
  const currentUser = useRef(userId);
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  useEffect(() => { currentUser.current = userId; }, [userId]);

  useEffect(() => {
    if (authLoading) return;
    const controller = new AbortController();
    setIds(new Set());
    setError(false);
    setLoading(!!userId);
    if (userId) {
      fetch("/api/bookmarks", { signal: controller.signal })
        .then(async (res) => { if (!res.ok) throw Error(); return res.json(); })
        .then((data) => { if (!controller.signal.aborted) setIds(new Set(data.ids)); })
        .catch(() => { if (!controller.signal.aborted) setError(true); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }
    return () => controller.abort();
  }, [userId, authLoading, version]);

  const toggle = useCallback(async (id: string) => {
    if (!userId) {
      router.push(withReturnTo("/login", pathname + window.location.search));
      return;
    }
    if (loading || error || busy.current.has(id)) return;
    busy.current.add(id);
    setPending(new Set(busy.current));
    const wasSaved = ids.has(id);
    setIds((prev) => { const next = new Set(prev); if (wasSaved) next.delete(id); else next.add(id); return next; });
    try {
      const res = await fetch("/api/bookmarks", { method: wasSaved ? "DELETE" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ auditionId: id }) });
      if (!res.ok) throw Error();
    } catch {
      if (currentUser.current === userId) {
        setIds((prev) => { const next = new Set(prev); if (wasSaved) next.add(id); else next.delete(id); return next; });
        toast.error("찜 저장에 실패했습니다. 다시 시도해주세요.");
      }
    } finally {
      busy.current.delete(id);
      setPending(new Set(busy.current));
    }
  }, [userId, router, pathname, loading, error, ids, toast]);
  return <Context.Provider value={{ ids, pending, loading: authLoading || loading, toggle, reload: () => setVersion((v) => v + 1), error }}>{children}</Context.Provider>;
}

export function useBookmarks() {
  const value = useContext(Context);
  if (!value) throw Error("BookmarksProvider가 필요합니다.");
  return value;
}

export function BookmarkButton({ auditionId }: { auditionId: string }) {
  const { ids, pending, loading, toggle, reload, error } = useBookmarks();
  const saved = ids.has(auditionId);
  return <button type="button" aria-label={error ? "찜 상태 다시 불러오기" : saved ? "찜 해제" : "공고 찜하기"} aria-pressed={saved}
    disabled={loading || pending.has(auditionId)} onClick={() => error ? reload() : toggle(auditionId)}
    className="grid size-11 shrink-0 place-items-center rounded-full bg-white text-gray-600 transition-colors active:bg-gray-100 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
    <Bookmark size={19} className={saved ? "fill-primary text-primary" : ""} />
  </button>;
}
