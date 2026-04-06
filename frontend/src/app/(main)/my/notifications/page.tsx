"use client";

import { Bell } from "lucide-react";

export default function NotificationsPage() {
  return (
    <div className="pb-4">
      <h1 className="text-lg font-bold mb-6">알림 설정</h1>
      <div className="rounded-xl bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
        <div className="flex flex-col items-center justify-center py-8 text-gray-400">
          <Bell size={40} className="mb-3 opacity-50" />
          <p className="text-sm font-medium mb-1">알림 기능 준비 중</p>
          <p className="text-xs text-center leading-relaxed">
            마감 임박 알림, 신규 공고 알림 등<br />
            편리한 알림 기능을 곧 제공할 예정입니다.
          </p>
        </div>
      </div>
    </div>
  );
}
