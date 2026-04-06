import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "개인정보처리방침",
};

export default function PrivacyPage() {
  return (
    <div className="pb-4">
      <h1 className="text-lg font-bold mb-6">개인정보처리방침</h1>
      <div className="rounded-xl bg-white p-5 shadow-[0_1px_4px_rgba(0,0,0,0.04)] text-sm text-gray-600 leading-relaxed space-y-6">
        <section>
          <h2 className="font-bold text-gray-900 mb-2">1. 개인정보의 수집 및 이용 목적</h2>
          <p>
            오디션패스(이하 &quot;회사&quot;)는 다음의 목적을 위해 개인정보를
            수집·이용합니다.
          </p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>회원 가입 및 관리: 본인 확인, 서비스 제공</li>
            <li>오디션 지원 서비스: 프로필 정보를 오디션 주최측에 전송</li>
            <li>서비스 개선: 이용 통계 분석, 서비스 품질 향상</li>
            <li>고객 지원: 문의 응답, 공지사항 전달</li>
          </ul>
        </section>

        <section>
          <h2 className="font-bold text-gray-900 mb-2">2. 수집하는 개인정보 항목</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>필수: 이메일, 비밀번호</li>
            <li>
              선택(프로필): 이름, 나이, 성별, 키, 몸무게, 사진, 소개, SNS
              링크, 경력, 연락처
            </li>
          </ul>
        </section>

        <section>
          <h2 className="font-bold text-gray-900 mb-2">3. 개인정보의 보유 및 이용 기간</h2>
          <p>
            회원 탈퇴 시 즉시 파기합니다. 단, 관련 법령에 따라 보존이 필요한
            경우 해당 기간 동안 보관합니다.
          </p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>계약 또는 청약 철회 기록: 5년 (전자상거래법)</li>
            <li>접속 기록: 3개월 (통신비밀보호법)</li>
          </ul>
        </section>

        <section>
          <h2 className="font-bold text-gray-900 mb-2">4. 개인정보의 제3자 제공</h2>
          <p>
            회원이 오디션에 지원할 경우, 해당 오디션 주최측에 프로필 정보가
            이메일로 전송됩니다. 이 외에는 이용자의 동의 없이 제3자에게
            개인정보를 제공하지 않습니다.
          </p>
        </section>

        <section>
          <h2 className="font-bold text-gray-900 mb-2">5. 개인정보의 파기 절차 및 방법</h2>
          <p>
            전자적 파일 형태의 정보는 복구할 수 없는 방법으로 영구 삭제하며,
            종이에 기록된 개인정보는 분쇄기로 파기합니다.
          </p>
        </section>

        <section>
          <h2 className="font-bold text-gray-900 mb-2">6. 이용자의 권리</h2>
          <p>
            이용자는 언제든지 자신의 개인정보를 조회·수정·삭제할 수 있으며,
            회원 탈퇴를 통해 개인정보 처리 정지를 요청할 수 있습니다.
          </p>
        </section>

        <section>
          <h2 className="font-bold text-gray-900 mb-2">7. 개인정보 보호책임자</h2>
          <p>
            문의: support@auditionpass.co.kr
          </p>
        </section>

        <p className="text-xs text-gray-400 pt-4 border-t border-gray-100">
          시행일: 2026년 4월 6일
        </p>
      </div>
    </div>
  );
}
