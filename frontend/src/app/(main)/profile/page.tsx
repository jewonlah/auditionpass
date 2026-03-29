"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { ProfileForm } from "@/components/profile/ProfileForm";
import type { Profile } from "@/types";
import { Loader2 } from "lucide-react";

export default function ProfilePage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.push("/login");
      return;
    }

    async function fetchProfile() {
      const res = await fetch("/api/profile");
      const data = await res.json();
      setProfile(data.profile ?? null);
      setLoading(false);
    }

    fetchProfile();
  }, [user, authLoading, router]);

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="pb-4">
      <h1 className="text-lg font-bold mb-1">
        {profile ? "프로필 수정" : "프로필 등록"}
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        {profile
          ? "정보를 수정하고 저장하세요."
          : "오디션 지원에 사용할 프로필을 등록하세요."}
      </p>
      <ProfileForm initialData={profile} />
    </div>
  );
}
