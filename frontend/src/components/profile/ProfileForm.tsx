"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PhotoUpload } from "@/components/profile/PhotoUpload";
import { cn, resolveReturnTo } from "@/lib/utils";
import type { Profile } from "@/types";
import {
  Save,
  Camera as InstaIcon,
  Video,
  Link as LinkIcon,
  X,
  Plus,
} from "lucide-react";

const profileSchema = z.object({
  name: z.string().min(1, "이름을 입력해주세요").max(20, "20자 이내로 입력해주세요"),
  birth_year: z.coerce
    .number({ error: "숫자를 입력해주세요" })
    .int()
    .min(1940, "올바른 출생연도를 입력해주세요")
    .max(2015, "14세 이상만 가입 가능합니다"),
  gender: z.enum(["남성", "여성", "기타"], {
    error: "성별을 선택해주세요",
  }),
  height: z.coerce.number().int().min(100).max(250).nullable().optional(),
  weight: z.coerce.number().int().min(30).max(200).nullable().optional(),
  bio: z.string().max(100, "100자 이내로 입력해주세요").nullable().optional(),
  instagram_url: z.string().url("올바른 URL을 입력해주세요").nullable().optional().or(z.literal("")),
  youtube_url: z.string().url("올바른 URL을 입력해주세요").nullable().optional().or(z.literal("")),
  other_url: z.string().url("올바른 URL을 입력해주세요").nullable().optional().or(z.literal("")),
  genre: z.array(z.string()).min(1, "장르를 하나 이상 선택해주세요"),
  activity_field: z.array(z.string()).min(1, "활동 분야를 하나 이상 선택해주세요"),
  phone: z.string().max(20, "20자 이내로 입력해주세요").nullable().optional(),
  agency: z.string().max(50, "50자 이내로 입력해주세요").nullable().optional(),
  specialty: z.array(z.string()).max(3, "특기는 최대 3개까지 입력 가능합니다"),
  career: z.string().max(500, "500자 이내로 입력해주세요").nullable().optional(),
});

type ProfileFormData = z.infer<typeof profileSchema>;

const GENDERS = ["남성", "여성", "기타"] as const;
const GENRES = ["배우", "모델"] as const;
const ACTIVITY_FIELDS = ["배우", "모델", "가수"] as const;

interface ProfileFormProps {
  initialData: Profile | null;
}

export function ProfileForm({ initialData }: ProfileFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [photos, setPhotos] = useState<string[]>(initialData?.photo_urls ?? []);
  const [serverError, setServerError] = useState("");
  const [specialtyInput, setSpecialtyInput] = useState("");
  const isEdit = !!initialData;

  // AI 소개문 — 랜딩의 약속 "프로필은 AI가 씁니다". 초안은 AI, 확정은 본인.
  const [polishing, setPolishing] = useState(false);
  const [polishError, setPolishError] = useState("");

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema) as Resolver<ProfileFormData>,
    defaultValues: {
      name: initialData?.name ?? "",
      // 구 데이터(age만 보유)는 출생연도로 환산해 프리필 (009 마이그레이션과 동일 규칙)
      birth_year:
        initialData?.birth_year ??
        (initialData?.age
          ? new Date().getFullYear() - initialData.age
          : (undefined as unknown as number)),
      gender: initialData?.gender ?? undefined,
      height: initialData?.height ?? undefined,
      weight: initialData?.weight ?? undefined,
      bio: initialData?.bio ?? "",
      instagram_url: initialData?.instagram_url ?? "",
      youtube_url: initialData?.youtube_url ?? "",
      other_url: initialData?.other_url ?? "",
      genre: initialData?.genre ?? [],
      activity_field: initialData?.activity_field ?? [],
      phone: initialData?.phone ?? "",
      agency: initialData?.agency ?? "",
      specialty: initialData?.specialty ?? [],
      career: initialData?.career ?? "",
    },
  });

  const selectedGender = watch("gender");
  const selectedGenre = watch("genre");
  const selectedActivityField = watch("activity_field");
  const specialtyList = watch("specialty");
  const bioValue = watch("bio") ?? "";
  const careerValue = watch("career") ?? "";

  function toggleGenre(g: string) {
    const current = selectedGenre ?? [];
    const next = current.includes(g)
      ? current.filter((v) => v !== g)
      : [...current, g];
    setValue("genre", next, { shouldValidate: true });
  }

  function toggleActivityField(f: string) {
    const current = selectedActivityField ?? [];
    const next = current.includes(f)
      ? current.filter((v) => v !== f)
      : [...current, f];
    setValue("activity_field", next, { shouldValidate: true });
  }

  function addSpecialty() {
    const tag = specialtyInput.trim();
    if (!tag || specialtyList.length >= 3) return;
    if (specialtyList.includes(tag)) {
      setSpecialtyInput("");
      return;
    }
    setValue("specialty", [...specialtyList, tag], { shouldValidate: true });
    setSpecialtyInput("");
  }

  function removeSpecialty(tag: string) {
    setValue(
      "specialty",
      specialtyList.filter((t) => t !== tag),
      { shouldValidate: true }
    );
  }

  async function onSubmit(data: ProfileFormData) {
    setServerError("");

    const payload = {
      ...data,
      height: data.height || null,
      weight: data.weight || null,
      bio: data.bio || null,
      instagram_url: data.instagram_url || null,
      youtube_url: data.youtube_url || null,
      other_url: data.other_url || null,
      phone: data.phone || null,
      agency: data.agency || null,
      career: data.career || null,
      photo_urls: photos,
    };

    const res = await fetch("/api/profile", {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await res.json();

    if (!res.ok) {
      setServerError(result.error || "저장에 실패했습니다.");
      return;
    }

    // F3: 저장 후 원래 맥락으로 복귀 (랜딩 추방 버그 A6 해소), 폴백 /my
    router.push(resolveReturnTo(searchParams.get("returnTo"), "/my"));
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {serverError && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">
          {serverError}
        </div>
      )}

      {/* 사진 업로드 */}
      <PhotoUpload photos={photos} onChange={setPhotos} />

      {/* 기본 정보 */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-200 pb-2">
          기본 정보
        </h3>

        <Input
          label="이름 *"
          placeholder="실명을 입력해주세요"
          error={errors.name?.message}
          {...register("name")}
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="출생연도 *"
            type="number"
            placeholder="2004"
            error={errors.birth_year?.message}
            {...register("birth_year")}
          />
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1.5 block">
              성별 *
            </label>
            <div className="flex gap-2">
              {GENDERS.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setValue("gender", g, { shouldValidate: true })}
                  className={cn(
                    "flex-1 rounded-lg border py-2.5 text-sm font-medium transition-colors",
                    selectedGender === g
                      ? "border-primary bg-primary text-white"
                      : "border-gray-300 text-gray-600 hover:border-gray-400"
                  )}
                >
                  {g}
                </button>
              ))}
            </div>
            {errors.gender && (
              <p className="mt-1 text-sm text-red-500">{errors.gender.message}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="키 (cm)"
            type="number"
            placeholder="170"
            error={errors.height?.message}
            {...register("height")}
          />
          <Input
            label="몸무게 (kg)"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="60"
            error={errors.weight?.message}
            className="[&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            {...register("weight", {
              onChange: (e) => {
                e.target.value = e.target.value.replace(/[^0-9]/g, "");
              },
            })}
          />
        </div>

        <Input
          label="연락처"
          type="tel"
          placeholder="010-0000-0000"
          error={errors.phone?.message}
          {...register("phone")}
        />
      </div>

      {/* 한 줄 소개 — 사실만 넣으면 AI가 초안을 쓴다 */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-sm font-medium text-gray-700">한 줄 소개</label>
          <button
            type="button"
            disabled={polishing}
            onClick={async () => {
              setPolishError("");
              setPolishing(true);
              try {
                const v = getValues();
                const res = await fetch("/api/profile/polish", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    birth_year: v.birth_year || null,
                    gender: v.gender || null,
                    height: v.height || null,
                    genre: v.genre,
                    activity_field: v.activity_field,
                    specialty: v.specialty,
                    career: v.career || null,
                    bio: v.bio || null,
                  }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "생성 실패");
                setValue("bio", data.bio, { shouldValidate: true, shouldDirty: true });
              } catch (e) {
                setPolishError(e instanceof Error ? e.message : "소개문 생성에 실패했습니다.");
              } finally {
                setPolishing(false);
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 px-3 py-1 text-xs font-bold text-primary transition-colors hover:bg-red-50 disabled:opacity-50"
          >
            {polishing ? (
              <>
                <span className="size-3 animate-spin rounded-full border-[1.5px] border-primary/30 border-t-primary" />
                쓰는 중…
              </>
            ) : (
              "AI로 소개 쓰기"
            )}
          </button>
        </div>
        <textarea
          placeholder="자신을 한 줄로 소개해주세요"
          maxLength={100}
          rows={2}
          className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-base transition-colors placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
          {...register("bio")}
        />
        <div className="flex justify-between mt-1">
          {errors.bio && (
            <p className="text-sm text-red-500">{errors.bio.message}</p>
          )}
          {polishError && !errors.bio && (
            <p className="text-sm text-red-500">{polishError}</p>
          )}
          <p className="text-xs text-gray-400 ml-auto">{bioValue.length}/100</p>
        </div>
        <p className="mt-1 text-xs text-gray-400">
          분야·특기·경력을 채운 뒤 누르면 더 잘 씁니다. 고쳐 쓰셔도 됩니다.
        </p>
      </div>

      {/* 활동 분야 */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-200 pb-2 mb-3">
          활동 분야 *
        </h3>
        <div className="flex gap-3">
          {ACTIVITY_FIELDS.map((f) => {
            const selected = selectedActivityField?.includes(f);
            return (
              <button
                key={f}
                type="button"
                onClick={() => toggleActivityField(f)}
                className={cn(
                  "flex-1 rounded-lg border-2 py-3 text-sm font-semibold transition-colors",
                  selected
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-gray-200 text-gray-500 hover:border-gray-300"
                )}
              >
                {f}
              </button>
            );
          })}
        </div>
        {errors.activity_field && (
          <p className="mt-1 text-sm text-red-500">{errors.activity_field.message}</p>
        )}
      </div>

      {/* 장르 선택 */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-200 pb-2 mb-3">
          장르 선택 *
        </h3>
        <div className="flex gap-3">
          {GENRES.map((g) => {
            const selected = selectedGenre?.includes(g);
            return (
              <button
                key={g}
                type="button"
                onClick={() => toggleGenre(g)}
                className={cn(
                  "flex-1 rounded-lg border-2 py-3 text-sm font-semibold transition-colors",
                  selected
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-gray-200 text-gray-500 hover:border-gray-300"
                )}
              >
                {g}
              </button>
            );
          })}
        </div>
        {errors.genre && (
          <p className="mt-1 text-sm text-red-500">{errors.genre.message}</p>
        )}
      </div>

      {/* 소속사 */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-200 pb-2">
          소속 정보
        </h3>
        <Input
          label="소속사"
          placeholder="프리랜서인 경우 '프리랜서' 입력"
          error={errors.agency?.message}
          {...register("agency")}
        />
      </div>

      {/* 특기 */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-200 pb-2 mb-3">
          특기 (최대 3개)
        </h3>
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            value={specialtyInput}
            onChange={(e) => setSpecialtyInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addSpecialty();
              }
            }}
            placeholder="예: 액션연기, 수영, 피아노"
            maxLength={20}
            disabled={specialtyList.length >= 3}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-base transition-colors placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-gray-50 disabled:text-gray-400"
          />
          <button
            type="button"
            onClick={addSpecialty}
            disabled={!specialtyInput.trim() || specialtyList.length >= 3}
            className="shrink-0 rounded-lg border border-primary bg-primary/5 px-3 py-2.5 text-primary transition-colors hover:bg-primary/10 disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-400"
          >
            <Plus size={18} />
          </button>
        </div>
        {specialtyList.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {specialtyList.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeSpecialty(tag)}
                  className="rounded-full p-0.5 hover:bg-primary/20 transition-colors"
                >
                  <X size={14} />
                </button>
              </span>
            ))}
          </div>
        )}
        {errors.specialty && (
          <p className="mt-1 text-sm text-red-500">{errors.specialty.message}</p>
        )}
      </div>

      {/* 경력 */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-200 pb-2 mb-3">
          경력
        </h3>
        <textarea
          placeholder="출연 작품, 수상 경력, 교육 이력 등을 자유롭게 작성해주세요"
          maxLength={500}
          rows={4}
          className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-base transition-colors placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
          {...register("career")}
        />
        <div className="flex justify-between mt-1">
          {errors.career && (
            <p className="text-sm text-red-500">{errors.career.message}</p>
          )}
          <p className="text-xs text-gray-400 ml-auto">{careerValue.length}/500</p>
        </div>
      </div>

      {/* 외부 링크 */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-200 pb-2">
          외부 링크
        </h3>

        <div className="relative">
          <Input
            label="인스타그램"
            placeholder="https://instagram.com/username"
            error={errors.instagram_url?.message}
            {...register("instagram_url")}
          />
          <InstaIcon
            size={18}
            className="absolute right-3 top-[38px] text-gray-400 pointer-events-none"
          />
        </div>

        <div className="relative">
          <Input
            label="유튜브"
            placeholder="https://youtube.com/@channel"
            error={errors.youtube_url?.message}
            {...register("youtube_url")}
          />
          <Video
            size={18}
            className="absolute right-3 top-[38px] text-gray-400 pointer-events-none"
          />
        </div>

        <div className="relative">
          <Input
            label="기타 링크"
            placeholder="https://..."
            error={errors.other_url?.message}
            {...register("other_url")}
          />
          <LinkIcon
            size={18}
            className="absolute right-3 top-[38px] text-gray-400 pointer-events-none"
          />
        </div>
      </div>

      {/* 저장 버튼 */}
      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          "저장 중..."
        ) : (
          <span className="flex items-center justify-center gap-2">
            <Save size={18} />
            {isEdit ? "프로필 수정" : "프로필 등록"}
          </span>
        )}
      </Button>
    </form>
  );
}
