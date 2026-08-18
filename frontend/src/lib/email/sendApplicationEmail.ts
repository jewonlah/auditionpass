import { render } from "@react-email/render";
import { resend, FROM_EMAIL } from "./resend";
import { ApplicationEmail } from "./templates/application";
import { createServerClient } from "@/lib/supabase/server";
import type { Profile, Audition } from "@/types";

interface SendApplicationEmailParams {
  audition: Pick<Audition, "title" | "apply_email" | "company">;
  profile: Profile;
}

/**
 * photo_urls(공개 URL)를 서명된 URL로 변환
 * 서명된 URL은 7일간 유효
 */
async function getSignedPhotoUrls(photoUrls: string[]): Promise<string[]> {
  if (photoUrls.length === 0) return [];

  const supabase = await createServerClient();
  const signedUrls: string[] = [];

  for (const url of photoUrls) {
    // 공개 URL에서 Storage 경로 추출: .../profiles/userId/filename.jpg
    const match = url.match(/\/profiles\/(.+)$/);
    if (!match) {
      signedUrls.push(url);
      continue;
    }

    const filePath = match[1];
    const { data, error } = await supabase.storage
      .from("profiles")
      .createSignedUrl(filePath, 60 * 60 * 24 * 7); // 7일

    signedUrls.push(error || !data ? url : data.signedUrl);
  }

  return signedUrls;
}

/**
 * 나이 표기 — birth_year 우선(만나이 + 년생 병기), 구 데이터는 age 폴백
 * 예: "만 22세 (2004년생)" / "27세"
 */
function formatAgeLabel(profile: Profile): string {
  if (profile.birth_year) {
    const age = new Date().getFullYear() - profile.birth_year;
    return `만 ${age}세 (${profile.birth_year}년생)`;
  }
  return profile.age ? `${profile.age}세` : "";
}

export async function sendApplicationEmail({
  audition,
  profile,
}: SendApplicationEmailParams) {
  if (!audition.apply_email) {
    throw new Error("이 오디션은 이메일 지원이 불가능합니다.");
  }

  const ageLabel = formatAgeLabel(profile);

  // 프로필 사진을 서명된 URL로 변환
  const signedPhotoUrls = await getSignedPhotoUrls(profile.photo_urls);

  const emailHtml = await render(
    ApplicationEmail({
      auditionTitle: audition.title,
      applicantName: profile.name,
      applicantAgeLabel: ageLabel,
      applicantGender: profile.gender,
      applicantHeight: profile.height,
      applicantWeight: profile.weight,
      applicantBio: profile.bio,
      applicantPhone: profile.phone,
      applicantAgency: profile.agency,
      applicantSpecialty: profile.specialty,
      applicantCareer: profile.career,
      instagramUrl: profile.instagram_url,
      youtubeUrl: profile.youtube_url,
      otherUrl: profile.other_url,
      photoUrls: signedPhotoUrls,
    })
  );

  // 제목: 캐스팅 담당자가 한눈에 스캔할 수 있도록 핵심 정보 우선 배치
  const genreLabel = profile.genre?.[0];
  const descriptor = [
    `${profile.gender}`,
    ...(ageLabel ? [ageLabel] : []),
    ...(genreLabel ? [genreLabel] : []),
  ].join("/");
  const subject = `[오디션 지원] ${profile.name} (${descriptor})`;

  const { data, error } = await resend.emails.send({
    from: `오디션패스 <${FROM_EMAIL}>`,
    to: audition.apply_email,
    subject,
    html: emailHtml,
  });

  if (error) {
    throw new Error(`이메일 발송 실패: ${error.message}`);
  }

  return data;
}
