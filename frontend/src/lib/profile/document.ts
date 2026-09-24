import type { Profile } from "@/types";

import { TEMPLATE_IDS, type TemplateId } from "./templates";
export { PROFILE_TEMPLATES } from "./templates";
export type ProfileTemplate = TemplateId;
export type ProfileDocument = {
  schemaVersion: 1;
  template: ProfileTemplate;
  version: number | null;
  profile: Partial<Profile>;
};

/** Explicit projection: never carry IDs, server metadata or unrelated private fields into a document. */
export function buildProfileDocument(input: Partial<Profile>): ProfileDocument {
  const template = input.template_id ?? "casting";
  if (!TEMPLATE_IDS.includes(template)) throw new Error("알 수 없는 프로필 서식입니다.");
  const text = (v: unknown) => typeof v === "string" ? v.trim() : "";
  const number = (v: unknown) => v !== "" && v != null && Number.isFinite(Number(v)) ? Number(v) : null;
  const list = (v: unknown) => Array.isArray(v) ? v.filter((item): item is string => typeof item === "string").map(text).filter(Boolean) : [];
  const url = (v: unknown) => /^https?:\/\//i.test(text(v)) ? text(v) : "";
  return {
    schemaVersion: 1,
    template,
    version: input.document_version ?? null,
    profile: {
      name: text(input.name), birth_year: number(input.birth_year), age: number(input.age),
      template_variant: input.template_variant === "model" ? "model" : "actor",
      education: text(input.education), awards: text(input.awards),
      guardian_name: text(input.guardian_name), guardian_phone: text(input.guardian_phone),
      gender: input.gender, height: number(input.height), weight: number(input.weight),
      genre: list(input.genre), specialty: list(input.specialty), bio: text(input.bio),
      career: text(input.career), agency: text(input.agency), phone: text(input.phone),
      training: text(input.training), introduction_url: url(input.introduction_url),
      performance_url: url(input.performance_url), audio_url: url(input.audio_url),
      photo_urls: list(input.photo_urls).filter((v) => !!url(v)).slice(0, 5),
      instagram_url: url(input.instagram_url), youtube_url: url(input.youtube_url), other_url: url(input.other_url),
    },
  };
}
