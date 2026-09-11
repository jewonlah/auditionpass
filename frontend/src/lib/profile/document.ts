import type { Profile } from "@/types";

export const PROFILE_TEMPLATES = [
  { id: "casting", name: "캐스팅", description: "사진과 정보를 균형 있게" },
  { id: "portfolio", name: "사진 중심", description: "대표 사진을 크게" },
  { id: "career", name: "경력 중심", description: "소개와 활동 이력을 먼저" },
] as const;
export type ProfileTemplate = typeof PROFILE_TEMPLATES[number]["id"];
export type ProfileDocument = {
  schemaVersion: 1;
  template: ProfileTemplate;
  version: number | null;
  profile: Partial<Profile>;
};

/** Explicit projection: never carry IDs, server metadata or unrelated private fields into a document. */
export function buildProfileDocument(input: Partial<Profile>): ProfileDocument {
  const text = (v: unknown) => typeof v === "string" ? v.trim() : "";
  const number = (v: unknown) => v !== "" && v != null && Number.isFinite(Number(v)) ? Number(v) : null;
  const list = (v: unknown) => Array.isArray(v) ? v.filter((item): item is string => typeof item === "string").map(text).filter(Boolean) : [];
  const url = (v: unknown) => /^https?:\/\//i.test(text(v)) ? text(v) : "";
  return {
    schemaVersion: 1,
    template: PROFILE_TEMPLATES.find((t) => t.id === input.template_id)?.id ?? "casting",
    version: input.document_version ?? null,
    profile: {
      name: text(input.name), birth_year: number(input.birth_year), age: number(input.age),
      gender: input.gender, height: number(input.height), weight: number(input.weight),
      genre: list(input.genre), specialty: list(input.specialty), bio: text(input.bio),
      career: text(input.career), agency: text(input.agency), phone: text(input.phone),
      photo_urls: list(input.photo_urls).filter((v) => !!url(v)).slice(0, 5),
      instagram_url: url(input.instagram_url), youtube_url: url(input.youtube_url), other_url: url(input.other_url),
    },
  };
}
