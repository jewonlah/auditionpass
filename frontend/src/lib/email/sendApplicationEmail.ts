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

export async function sendApplicationEmail({
  audition,
  profile,
}: SendApplicationEmailParams) {
  if (!audition.apply_email) {
    throw new Error("이 오디션은 이메일 지원이 불가능합니다.");
  }

  // 프로필 사진을 서명된 URL로 변환
  const signedPhotoUrls = await getSignedPhotoUrls(profile.photo_urls);

  const emailHtml = await render(
    ApplicationEmail({
      auditionTitle: audition.title,
      applicantName: profile.name,
      applicantAge: profile.age,
      applicantGender: profile.gender,
      applicantHeight: profile.height,
      applicantWeight: profile.weight,
      applicantBio: profile.bio,
      instagramUrl: profile.instagram_url,
      youtubeUrl: profile.youtube_url,
      otherUrl: profile.other_url,
      photoUrls: signedPhotoUrls,
    })
  );

  const { data, error } = await resend.emails.send({
    from: `오디션패스 <${FROM_EMAIL}>`,
    to: audition.apply_email,
    subject: `[오디션 지원] ${profile.name} / ${profile.gender} / ${profile.age}세`,
    html: emailHtml,
  });

  if (error) {
    throw new Error(`이메일 발송 실패: ${error.message}`);
  }

  return data;
}
