import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "오디션패스 | 배우·모델 오디션 정보를 한 곳에서",
  description:
    "흩어진 배우·모델 오디션 공고를 매일 자동으로 수집합니다. 프로필 한 번 등록하면 원클릭으로 지원 완료. 지금 무료로 시작하세요.",
  keywords: [
    "오디션",
    "오디션 정보",
    "배우 오디션",
    "모델 오디션",
    "캐스팅",
    "오디션 지원",
    "배우 지망생",
    "모델 지망생",
    "오디션패스",
    "원클릭 지원",
    "뮤지컬 오디션",
    "연극 오디션",
    "영화 오디션",
    "드라마 캐스팅",
  ],
  openGraph: {
    title: "오디션패스 — 당신의 다음 무대",
    description:
      "배우·모델 오디션 정보를 한 곳에서. 매일 자동 수집, 원클릭 지원.",
    type: "website",
    locale: "ko_KR",
    siteName: "오디션패스",
  },
  twitter: {
    card: "summary_large_image",
    title: "오디션패스 — 당신의 다음 무대",
    description:
      "배우·모델 오디션 정보를 한 곳에서. 매일 자동 수집, 원클릭 지원.",
  },
  alternates: {
    canonical: "/",
  },
};

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* NAV */}
      <nav className="fixed top-0 w-full bg-white/95 backdrop-blur-sm z-50 border-b border-gray-100">
        <div className="max-w-[1100px] mx-auto px-6 py-4 flex justify-between items-center">
          <Link href="/" className="text-xl font-extrabold text-[#6366F1]">
            AUDITION<span className="text-[#EC4899]">PASS</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
            >
              로그인
            </Link>
            <Link
              href="/signup"
              className="bg-[#6366F1] text-white px-5 py-2.5 rounded-full text-sm font-semibold hover:bg-[#4F46E5] transition-colors"
            >
              무료로 시작하기
            </Link>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="pt-36 pb-20 px-6 text-center bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 relative overflow-hidden">
        <div className="relative z-10 max-w-[700px] mx-auto">
          <span className="inline-block bg-white text-[#6366F1] px-5 py-2 rounded-full text-sm font-semibold border border-indigo-200 mb-6">
            배우 &amp; 모델을 위한 오디션 플랫폼
          </span>
          <h1 className="text-4xl md:text-5xl font-extrabold leading-tight mb-5 tracking-tight">
            오디션 정보,
            <br />
            <span className="bg-gradient-to-r from-[#6366F1] to-[#EC4899] bg-clip-text text-transparent">
              한 곳에서 끝내세요
            </span>
          </h1>
          <p className="text-lg text-gray-500 mb-9 leading-relaxed">
            흩어진 오디션 공고를 매일 자동으로 모아드립니다.
            <br />
            프로필 한 번 등록하면, 원클릭으로 지원 완료.
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <Link
              href="/signup"
              className="bg-[#6366F1] text-white px-9 py-4 rounded-full text-base font-bold hover:bg-[#4F46E5] transition-all shadow-lg shadow-indigo-300/30 hover:-translate-y-0.5"
            >
              지금 무료로 시작하기
            </Link>
            <Link
              href="/auditions"
              className="bg-white text-gray-900 px-9 py-4 rounded-full text-base font-semibold border border-gray-100 hover:border-[#6366F1] hover:text-[#6366F1] transition-all"
            >
              오디션 둘러보기
            </Link>
          </div>
          <div className="flex justify-center gap-12 mt-16 pt-10 border-t border-indigo-100/50">
            <div className="text-center">
              <div className="text-3xl font-extrabold text-[#6366F1]">500+</div>
              <div className="text-sm text-gray-500 mt-1">등록된 오디션</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-extrabold text-[#6366F1]">10+</div>
              <div className="text-sm text-gray-500 mt-1">크롤링 사이트</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-extrabold text-[#6366F1]">24h</div>
              <div className="text-sm text-gray-500 mt-1">자동 업데이트</div>
            </div>
          </div>
        </div>
      </section>

      {/* PAIN POINT */}
      <section className="py-24 px-6 bg-gray-50">
        <div className="max-w-[1100px] mx-auto">
          <p className="text-sm font-bold text-[#6366F1] uppercase tracking-wider mb-3">
            Problem
          </p>
          <h2 className="text-3xl md:text-4xl font-extrabold leading-snug mb-4">
            오디션 준비, 이런 고민 있으셨죠?
          </h2>
          <p className="text-base text-gray-500 mb-12">
            많은 배우/모델 지망생들이 겪는 공통적인 문제입니다.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                icon: "😩",
                bg: "bg-red-50",
                title: "정보가 너무 흩어져 있어요",
                desc: "카페, 블로그, 인스타, 사이트... 오디션 공고를 찾으려면 최소 5곳 이상을 매일 확인해야 합니다.",
              },
              {
                icon: "⏰",
                bg: "bg-amber-50",
                title: "마감일을 놓쳐요",
                desc: "좋은 오디션을 발견해도 이미 마감. 실시간으로 알려주는 곳이 없어서 기회를 놓치게 됩니다.",
              },
              {
                icon: "📝",
                bg: "bg-gray-100",
                title: "지원할 때마다 똑같은 반복",
                desc: "이름, 나이, 사진... 매번 같은 정보를 다시 입력하는 건 시간 낭비입니다.",
              },
            ].map((item) => (
              <article
                key={item.title}
                className="bg-white rounded-2xl p-8 border border-gray-100 hover:border-indigo-200 hover:-translate-y-1 transition-all hover:shadow-lg"
              >
                <div
                  className={`w-12 h-12 rounded-xl ${item.bg} flex items-center justify-center text-2xl mb-5`}
                >
                  {item.icon}
                </div>
                <h3 className="text-lg font-bold mb-2">{item.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">
                  {item.desc}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="py-24 px-6">
        <div className="max-w-[1100px] mx-auto">
          <p className="text-sm font-bold text-[#6366F1] uppercase tracking-wider mb-3">
            Solution
          </p>
          <h2 className="text-3xl md:text-4xl font-extrabold leading-snug mb-4">
            오디션패스가 해결합니다
          </h2>
          <p className="text-base text-gray-500 mb-12">
            더 이상 오디션 정보를 찾아 헤매지 마세요.
          </p>
          <div className="flex flex-col gap-8">
            {[
              {
                num: "01",
                title: "매일 자동으로 오디션 수집",
                desc: "10개 이상의 캐스팅 사이트에서 오디션 공고를 자동으로 크롤링합니다. 더 이상 여러 사이트를 돌아다닐 필요 없어요.",
                badge: "매일 업데이트",
              },
              {
                num: "02",
                title: "원클릭 지원",
                desc: "프로필을 한 번만 등록하세요. 이후에는 버튼 한 번으로 오디션 지원이 완료됩니다. 반복 입력은 이제 그만.",
                badge: "3초 만에 지원",
              },
              {
                num: "03",
                title: "마감 임박 알림",
                desc: "관심 있는 오디션의 마감일이 다가오면 알려드립니다. 다시는 좋은 기회를 놓치지 마세요.",
                badge: "D-3 자동 알림",
              },
            ].map((f) => (
              <div
                key={f.num}
                className="flex flex-col md:flex-row items-center gap-8 p-10 rounded-2xl bg-gray-50 border border-gray-100 hover:border-indigo-200 transition-colors"
              >
                <span className="text-5xl font-black text-indigo-200 min-w-[80px] text-center">
                  {f.num}
                </span>
                <div className="text-center md:text-left">
                  <h3 className="text-xl font-bold mb-2">{f.title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">
                    {f.desc}
                  </p>
                  <span className="inline-block mt-3 bg-emerald-50 text-emerald-600 px-3 py-1 rounded-full text-xs font-semibold">
                    {f.badge}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="py-24 px-6 bg-gray-50">
        <div className="max-w-[1100px] mx-auto">
          <p className="text-sm font-bold text-[#6366F1] uppercase tracking-wider mb-3">
            How it works
          </p>
          <h2 className="text-3xl md:text-4xl font-extrabold leading-snug mb-4">
            시작은 간단합니다
          </h2>
          <p className="text-base text-gray-500 mb-12">
            4단계로 오디션 지원을 시작하세요.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { num: 1, title: "회원가입", desc: "이메일로 30초 만에 가입" },
              {
                num: 2,
                title: "프로필 등록",
                desc: "사진, 신체 정보, 경력을 한 번 입력",
              },
              {
                num: 3,
                title: "오디션 탐색",
                desc: "장르, 마감일로 필터링",
              },
              {
                num: 4,
                title: "원클릭 지원",
                desc: "버튼 하나로 지원 완료",
              },
            ].map((s) => (
              <div key={s.num} className="text-center py-8">
                <div className="w-16 h-16 rounded-full bg-[#6366F1] text-white text-2xl font-extrabold flex items-center justify-center mx-auto mb-5">
                  {s.num}
                </div>
                <h3 className="text-base font-bold mb-2">{s.title}</h3>
                <p className="text-xs text-gray-500 leading-relaxed">
                  {s.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING — 전부 무료 */}
      <section className="py-24 px-6">
        <div className="max-w-[1100px] mx-auto">
          <p className="text-sm font-bold text-[#6366F1] uppercase tracking-wider mb-3">
            Pricing
          </p>
          <h2 className="text-3xl md:text-4xl font-extrabold leading-snug mb-4">
            지금은 모든 기능이 무료!
          </h2>
          <p className="text-base text-gray-500 mb-12">
            오디션패스는 현재 오픈 기념으로 모든 기능을 무료로 제공하고
            있습니다.
          </p>
          <div className="max-w-[560px] mx-auto bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 border-2 border-indigo-200 rounded-3xl p-12 text-center">
            <span className="inline-block bg-gradient-to-r from-[#6366F1] to-[#EC4899] text-white px-6 py-2 rounded-full text-sm font-extrabold tracking-widest mb-5">
              OPEN EVENT
            </span>
            <h3 className="text-2xl font-extrabold mb-2">전 기능 무료 이용</h3>
            <p className="text-sm text-gray-500 mb-8">
              가입만 하면 아래 모든 기능을 무료로 사용할 수 있어요
            </p>
            <ul className="text-left max-w-xs mx-auto mb-8 space-y-0">
              {[
                "오디션 공고 무제한 열람",
                "원클릭 지원 무제한",
                "프로필 등록 및 관리",
                "마감 임박 알림",
                "지원 이력 관리",
                "매일 신규 공고 업데이트",
              ].map((f) => (
                <li
                  key={f}
                  className="flex items-center gap-3 py-3 text-sm border-b border-indigo-100/50"
                >
                  <span className="text-emerald-500 font-bold">&#10003;</span>
                  {f}
                </li>
              ))}
            </ul>
            <Link
              href="/signup"
              className="inline-block bg-[#6366F1] text-white px-10 py-4 rounded-full text-base font-bold hover:bg-[#4F46E5] transition-all shadow-lg shadow-indigo-300/30 hover:-translate-y-0.5"
            >
              무료로 시작하기
            </Link>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="py-24 px-6 bg-gradient-to-br from-[#4F46E5] to-[#7C3AED] text-white text-center">
        <h2 className="text-3xl md:text-4xl font-extrabold mb-4">
          당신의 다음 무대,
          <br />
          오디션패스에서 시작하세요
        </h2>
        <p className="text-lg opacity-85 mb-9">
          지금 가입하면 무료로 오디션 공고를 확인할 수 있습니다.
        </p>
        <Link
          href="/signup"
          className="inline-block bg-white text-[#4F46E5] px-10 py-4 rounded-full text-base font-bold hover:-translate-y-0.5 transition-all shadow-lg"
        >
          무료로 시작하기
        </Link>
      </section>

      {/* FOOTER */}
      <footer className="bg-gray-900 text-gray-500 py-12 px-6 text-center">
        <div className="text-lg font-extrabold text-white mb-2">
          AUDITIONPASS
        </div>
        <p className="text-sm leading-loose">
          당신의 다음 무대, 오디션패스
          <br />
          <Link
            href="https://instagram.com/auditionpass.kr"
            className="text-indigo-300 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            @auditionpass.kr
          </Link>
          <br />
          <br />
          &copy; 2026 AUDITIONPASS. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
