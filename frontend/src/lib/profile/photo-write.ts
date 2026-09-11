import { ownedPhotoPath } from "./photos";

/** Validate only submitted photos; unrelated edits must preserve legacy stored URLs. */
export function profilePhotoWriteError(
  input: { photo_urls?: string[] },
  userId: string,
  storageUrl: string,
): { error: string; code: "PROFILE_PHOTO_REUPLOAD_REQUIRED" } | null {
  try {
    for (const url of input.photo_urls ?? []) ownedPhotoPath(url, userId, storageUrl);
    return null;
  } catch {
    return {
      error: "프로필 사진을 다시 업로드한 뒤 저장해주세요.",
      code: "PROFILE_PHOTO_REUPLOAD_REQUIRED",
    };
  }
}
