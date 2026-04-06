"use client";

import { FileText } from "lucide-react";

const NOTICES = [
  {
    id: 1,
    date: "2026-04-06",
    title: "오디션패스 서비스 오픈!",
    content:
      "안녕하세요, 오디션패스입니다. 배우·모델 오디션 정보를 한 곳에서 확인하고 원클릭으로 지원할 수 있는 서비스를 오픈했습니다. 현재 모든 기능을 무료로 제공하고 있으니 많은 이용 부탁드립니다.",
  },
];

export default function NoticePage() {
  return (
    <div className="pb-4">
      <h1 className="text-lg font-bold mb-6">공지사항</h1>

      {NOTICES.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <FileText size={40} className="mb-3 opacity-50" />
          <p className="text-sm">등록된 공지사항이 없습니다</p>
        </div>
      ) : (
        <div className="space-y-3">
          {NOTICES.map((notice) => (
            <article
              key={notice.id}
              className="rounded-xl bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,0.04)]"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[11px] text-gray-400">
                  {notice.date}
                </span>
              </div>
              <h3 className="text-sm font-bold mb-2">{notice.title}</h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                {notice.content}
              </p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
