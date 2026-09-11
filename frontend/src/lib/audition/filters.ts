import { PROFILE_GENRES } from "@/lib/profile";

/** Share category-first matching across search, home and onboarding. Only known labels enter PostgREST. */
export function categoryFilter(values: readonly string[]): string | null {
  const categories = [...new Set(values)].filter((v) => (PROFILE_GENRES as readonly string[]).includes(v));
  if (!categories.length) return null;
  return categories.map((value) => `category.eq.${value},and(category.is.null,genre.eq.${value})`).join(",");
}

export function searchFilter(value: string): string | null {
  // Quote PostgREST values and escape LIKE wildcards; punctuation must remain literal search text.
  const text = value.trim().slice(0, 200);
  if (!text) return null;
  const pattern = `%${text.replace(/[\\%_]/g, "\\$&")}%`;
  const quoted = `"${pattern.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  return `title.ilike.${quoted},company.ilike.${quoted}`;
}
