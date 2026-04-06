import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "이용약관",
};

export default function TermsPage() {
  return (
    <div className="pb-4">
      <h1 className="text-lg font-bold mb-6">이용약관</h1>
      <div className="rounded-xl bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.04)] text-sm text-gray-600 leading-relaxed space-y-6">
        <section>
          <h2 className="font-bold text-gray-900 mb-2">제1조 (목적)</h2>
          <p>
            본 약관은 오디션패스(이하 &quot;회사&quot;)가 제공하는 오디션 정보
            서비스(이하 &quot;서비스&quot;)의 이용 조건 및 절차에 관한 기본
            사항을 규정함을 목적으로 합니다.
          </p>
        </section>

        <section>
          <h2 className="font-bold text-gray-900 mb-2">제2조 (서비스의 내용)</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>오디션 공고 정보 수집 및 제공</li>
            <li>프로필 등록 및 관리</li>
            <li>원클릭 오디��� 지원 (이메일 발송)</li>
            <li>지원 이력 관리</li>
          </ul>
        </section>

        <section>
          <h2 className="font-bold text-gray-900 mb-2">제3조 (회원가입)</h2>
          <p>
            이용자는 이메일과 비밀번호를 입력하고 본 약관에 동의함으로써
            회원가입을 완료합니다.
          </p>
        </section>

        <section>
          <h2 className="font-bold text-gray-900 mb-2">제4조 (서비스 이용)</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>서비스는 연중무휴 24시간 제공을 원칙으로 합니다.</li>
            <li>
              시스템 점검, 장애 등 불가피한 사유로 서비스가 중단될 수
              있습니다.
            </li>
            <li>
              오디션 정보는 외부 사이트에서 자동 수집되며, 정보의 정확성을
              보장하지 않습니다.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="font-bold text-gray-900 mb-2">제5조 (이용자의 의무)</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>타인의 정보를 도용하여 지원하는 행위를 금지합니다.</li>
            <li>서비스를 이용한 불법 행위를 금지합니다.</li>
            <li>서비스의 안정적 운영을 방해하는 행위를 금지합니다.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-bold text-gray-900 mb-2">제6조 (면책 사항)</h2>
          <p>
            회사는 오디션 주최측의 결정, 오디션 결과, 외부 사이트의 정보
            변경에 대해 책임지지 않습니다. 이메일 발송 후 수신 여부는
            수신측 서버 환경에 따라 달라질 수 있습니다.
          </p>
        </section>

        <section>
          <h2 className="font-bold text-gray-900 mb-2">제7조 (회원 탈퇴)</h2>
          <p>
            회원은 언제든지 MY 메뉴를 통해 탈퇴를 요청할 수 있으며, 회사는
            즉시 처리합니다.
          </p>
        </section>

        <p className="text-xs text-gray-400 pt-4 border-t border-gray-100">
          시행일: 2026년 4월 6일
        </p>
      </div>
    </div>
  );
}
