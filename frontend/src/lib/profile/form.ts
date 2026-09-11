import { z } from "zod";
import { maxBirthYear, PROFILE_GENRES } from "@/lib/profile";

/** HTML number inputs return strings; normalize before validation, including cleared inputs. */
export function optionalNumber(value: unknown): unknown {
  if (value === "" || value === null || value === undefined) return null;
  return typeof value === "string" && value.trim() ? Number(value) : value;
}

const optionalMeasurement = (min: number, max: number) => z.preprocess(
  optionalNumber,
  z.number({ error: "숫자를 입력해주세요" }).int().min(min).max(max).nullable(),
);
const webUrl = z.string().url("올바른 URL을 입력해주세요").refine((url) => /^https?:\/\//i.test(url), "http 또는 https 링크를 입력해주세요");
const optionalUrl = webUrl.nullable().optional().or(z.literal(""));

export const profileFormSchema = z.object({
  template_id: z.enum(["casting", "portfolio", "career"]).default("casting"),
  name: z.string().trim().min(1, "이름을 입력해주세요").max(20, "20자 이내로 입력해주세요"),
  birth_year: z.coerce.number().int().min(1940, "출생연도를 확인해주세요").max(maxBirthYear(), "만 14세 이상만 가입할 수 있습니다"),
  gender: z.enum(["남성", "여성", "기타"], { error: "성별을 선택해주세요" }),
  height: optionalMeasurement(100, 250),
  weight: optionalMeasurement(30, 200),
  bio: z.string().max(100, "100자 이내로 입력해주세요").nullable().optional(),
  instagram_url: optionalUrl,
  youtube_url: optionalUrl,
  other_url: optionalUrl,
  genre: z.array(z.enum(PROFILE_GENRES)).min(1, "분야를 하나 이상 선택해주세요"),
  // Legacy data only. The UI asks one category question and saves it into genre.
  activity_field: z.array(z.string()).default([]),
  phone: z.string().max(20).nullable().optional(),
  agency: z.string().max(50).nullable().optional(),
  specialty: z.array(z.string().max(30)).max(3, "특기는 최대 3개까지 입력 가능합니다"),
  career: z.string().max(500, "500자 이내로 입력해주세요").nullable().optional(),
});

export type ProfileFormData = z.output<typeof profileFormSchema>;

/** Partial updates share field validation with the form; unknown/ownership fields are stripped. */
export const profileWriteSchema = profileFormSchema.partial().extend({
  // Form defaults are useful on creation, but must not overwrite omitted PUT fields.
  template_id: z.enum(["casting", "portfolio", "career"]).optional(),
  activity_field: z.array(z.string()).optional(),
  age: z.number().int().min(14).max(120).nullable().optional(),
  photo_urls: z.array(webUrl).max(5, "사진은 최대 5장까지 등록할 수 있어요").optional(),
});

export function buildPolishRequest(values: Record<string, unknown>) {
  return {
    birth_year: optionalNumber(values.birth_year),
    height: optionalNumber(values.height),
    gender: values.gender || null,
    genre: values.genre,
    specialty: values.specialty,
    career: values.career || null,
    bio: values.bio || null,
  };
}
