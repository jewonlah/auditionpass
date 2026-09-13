import type { Metadata } from "next";
import Link from "next/link";
import { CATEGORIES } from "@/lib/categories";

export const metadata: Metadata = {
  title: "오디션 준비와 지원, 여기서 시작하세요",
  description: "배우·모델·아이돌·뮤지컬 오디션 찾기부터 프로필 PDF 준비와 이메일 지원까지. 오디션패스 시작 가이드.",
  alternates: { canonical: "/start" },
};

export default function StartPage() {
  return <main className="mx-auto w-full max-w-3xl space-y-10 px-5 py-10 text-gray-900">
    <header><Link href="/" className="inline-flex min-h-11 items-center font-bold text-primary">오디션패스</Link><h1 className="mt-5 text-3xl font-bold leading-tight">오디션 준비부터 지원까지,<br />여기서 시작하세요.</h1><p className="mt-4 text-base leading-relaxed text-gray-600">내 분야의 공고를 찾고, 준비한 프로필과 자료로 지원하세요. 공고는 가입 없이 볼 수 있어요.</p></header>
    <section aria-labelledby="find-auditions"><h2 id="find-auditions" className="text-xl font-bold">내 분야의 오디션 찾기</h2><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">{CATEGORIES.map((category) => <Link key={category.slug} href={`/auditions/${category.slug}`} className="flex min-h-12 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-3 font-semibold text-primary">{category.genre} 오디션</Link>)}</div></section>
    <section className="rounded-2xl border border-gray-200 bg-white p-6"><h2 className="text-xl font-bold">지원 자료를 한 번 준비해 두세요</h2><p className="mt-3 leading-relaxed text-gray-600">프로필에서 사진·소개·경력을 입력하면 PDF로 만들 수 있어요. 자료 보관함에 올린 파일은 이메일 지원 전 최대 3개까지 추가로 선택할 수 있어요.</p><Link href="/portfolio" className="mt-5 inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-5 font-semibold text-white">내 포트폴리오 준비하기</Link></section>
    <section aria-labelledby="before-apply"><h2 id="before-apply" className="text-xl font-bold">지원 전에 확인해 주세요</h2><dl className="mt-4 space-y-5"><div><dt className="font-semibold">모든 공고에 이메일로 지원할 수 있나요?</dt><dd className="mt-2 leading-relaxed text-gray-600">이메일 지원이 제공되는 공고에서 사용할 수 있어요. 외부 접수 공고는 원문 사이트의 양식과 절차를 따라 주세요.</dd></div><div><dt className="font-semibold">어떤 사진과 영상을 준비하면 되나요?</dt><dd className="mt-2 leading-relaxed text-gray-600">공고마다 요구하는 사진 각도·장수·파일 크기와 영상 길이가 달라요. 원문 안내를 확인하고, 담당자가 열 수 있는 자료를 준비해 주세요.</dd></div><div><dt className="font-semibold">지원하면 합격이 보장되나요?</dt><dd className="mt-2 leading-relaxed text-gray-600">오디션패스는 공고 탐색과 자료 전달을 돕습니다. 심사와 결과 안내는 각 모집처에서 진행해요.</dd></div></dl></section>
    <nav className="flex flex-wrap gap-5 border-t border-gray-200 pt-5 text-sm"><Link href="/auditions" className="inline-flex min-h-11 items-center text-primary">전체 공고</Link><Link href="/privacy" className="inline-flex min-h-11 items-center">개인정보처리방침</Link><Link href="/terms" className="inline-flex min-h-11 items-center">이용약관</Link></nav>
  </main>;
}
