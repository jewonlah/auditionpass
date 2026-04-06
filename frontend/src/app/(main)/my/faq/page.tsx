"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

const FAQS = [
  {
    q: "오디션패스는 무료인가요?",
    a: "네, 현재 오픈 기념으로 모든 기능을 무료로 제공하고 있습니다. 오디션 공고 열람, 원클릭 지원, 프로필 관리 등 모든 기능을 무제한으로 이용하실 수 있습니다.",
  },
  {
    q: "원클릭 지원은 어떻게 작동하나요?",
    a: "프로필을 한 번 등록하시면, 오디션 지원 시 등록된 프로필 정보와 사진이 오디션 주최측 이메일로 자동 발송됩니다. 매번 같은 정보를 입력할 필요가 없습니다.",
  },
  {
    q: "오디션 정보는 어디서 가져오나요?",
    a: "국내 주요 캐스팅 사이트 10곳 이상에서 매일 자동으로 수집합니다. 새로운 공고가 올라오면 빠르게 반영됩니다.",
  },
  {
    q: "지원한 오디션의 결과를 알 수 있나요?",
    a: "오디션 결과는 각 주최측에서 직접 연락드립니다. 오디션패스는 지원 이메일 발송까지 담당하며, 이후 과정은 주최측과 직접 소통하시게 됩니다.",
  },
  {
    q: "프로필 사진은 몇 장까지 등록할 수 있나요?",
    a: "최대 5장까지 등록할 수 있습니다. 정면, 측면, 전신 등 다양한 각도의 사진을 등록하시면 지원에 도움이 됩니다.",
  },
  {
    q: "회원 탈퇴는 어떻게 하나요?",
    a: "MY > 문의하기를 통해 탈퇴를 요청하시면 즉시 처리해드립니다. 탈퇴 시 모든 개인정보와 지원 이력이 삭제됩니다.",
  },
];

export default function FaqPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="pb-4">
      <h1 className="text-lg font-bold mb-6">자주 묻는 질문</h1>
      <div className="rounded-xl bg-white shadow-[0_1px_4px_rgba(0,0,0,0.04)] overflow-hidden divide-y divide-gray-50">
        {FAQS.map((faq, i) => (
          <div key={i}>
            <button
              onClick={() => setOpenIndex(openIndex === i ? null : i)}
              className="flex w-full items-center gap-3 px-4 py-4 text-left hover:bg-gray-50 transition-colors"
            >
              <span className="text-sm font-medium flex-1">{faq.q}</span>
              <ChevronDown
                size={16}
                className={`text-gray-400 shrink-0 transition-transform ${
                  openIndex === i ? "rotate-180" : ""
                }`}
              />
            </button>
            {openIndex === i && (
              <div className="px-4 pb-4">
                <p className="text-xs text-gray-500 leading-relaxed bg-gray-50 rounded-lg p-3">
                  {faq.a}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
