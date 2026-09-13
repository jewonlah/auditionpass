import {
  Html,
  Body,
  Container,
  Section,
  Text,
  Heading,
  Hr,
  Link,
  Img,
  Row,
  Column,
} from "@react-email/components";
import type { ProfileTemplate } from "@/lib/profile/document";

interface ApplicationEmailProps {
  templateId?: ProfileTemplate;
  auditionTitle: string;
  applicantName: string;
  /** "만 22세 (2004년생)" 형식 — 발신부에서 포맷 */
  applicantAgeLabel: string;
  applicantGender: string;
  applicantHeight?: number | null;
  applicantWeight?: number | null;
  applicantBio?: string | null;
  applicantPhone?: string | null;
  applicantAgency?: string | null;
  applicantSpecialty?: string[];
  applicantCareer?: string | null;
  applicantTraining?: string | null;
  introductionUrl?: string | null;
  performanceUrl?: string | null;
  audioUrl?: string | null;
  instagramUrl?: string | null;
  youtubeUrl?: string | null;
  otherUrl?: string | null;
  photoUrls: string[];
}

export function ApplicationEmail({
  templateId = "casting",
  auditionTitle,
  applicantName,
  applicantAgeLabel,
  applicantGender,
  applicantHeight,
  applicantWeight,
  applicantBio,
  applicantPhone,
  applicantAgency,
  applicantSpecialty = [],
  applicantCareer,
  applicantTraining,
  introductionUrl,
  performanceUrl,
  audioUrl,
  instagramUrl,
  youtubeUrl,
  otherUrl,
  photoUrls,
}: ApplicationEmailProps) {
  const hasLinks = instagramUrl || youtubeUrl || otherUrl;

  return (
    <Html lang="ko">
      <Body style={main}>
        <Container style={container}>
          {/* 헤더 */}
          <Heading style={heading}>[오디션 지원] {applicantName}</Heading>
          <Text style={subtext}>
            안녕하세요, <strong>{auditionTitle}</strong> 오디션에 지원합니다.
          </Text>
          <Text style={subtext}>사진과 경력을 정리한 프로필 PDF를 첨부했습니다.</Text>

          {/* 프로필 사진 — 본문 상단 인라인 노출 */}
          {templateId !== "career" && photoUrls.length > 0 && (
            <Section style={{ margin: "0 0 8px 0" }}>
              {/* 대표 사진 (첫 번째, 크게) */}
              <Img
                src={photoUrls[0]}
                alt={`${applicantName} 프로필 사진 1`}
                width={templateId === "portfolio" ? "536" : "320"}
                style={{ ...heroPhoto, maxWidth: templateId === "portfolio" ? "536px" : "320px" }}
              />
              {/* 나머지 사진 2장씩 배치 */}
              {photoUrls.length > 1 && (
                <>{[1, 3].filter((start) => start < photoUrls.length).map((start) => <Row key={start} style={{ marginTop: "8px" }}>
                  {photoUrls.slice(start, start + 2).map((url, i) => (
                    <Column key={i} style={photoGridCell}>
                      <Img
                        src={url}
                        alt={`${applicantName} 프로필 사진 ${start + i + 1}`}
                        width="260"
                        style={gridPhoto}
                      />
                    </Column>
                  ))}
                </Row>)}</>
              )}
            </Section>
          )}

          <Hr style={hr} />

          {/* 지원자 정보 */}
          <Heading as="h3" style={sectionTitle}>
            지원자 정보
          </Heading>

          <Row style={tableRow}>
            <Column style={labelCell}>이름</Column>
            <Column style={valueCell}>{applicantName}</Column>
          </Row>
          {applicantAgeLabel && (
            <Row style={{ ...tableRow, backgroundColor: "#f9fafb" }}>
              <Column style={labelCell}>나이</Column>
              <Column style={valueCell}>{applicantAgeLabel}</Column>
            </Row>
          )}
          <Row style={tableRow}>
            <Column style={labelCell}>성별</Column>
            <Column style={valueCell}>{applicantGender}</Column>
          </Row>
          {applicantHeight && (
            <Row style={{ ...tableRow, backgroundColor: "#f9fafb" }}>
              <Column style={labelCell}>키</Column>
              <Column style={valueCell}>{applicantHeight}cm</Column>
            </Row>
          )}
          {applicantWeight && (
            <Row style={tableRow}>
              <Column style={labelCell}>몸무게</Column>
              <Column style={valueCell}>{applicantWeight}kg</Column>
            </Row>
          )}
          {applicantPhone && (
            <Row style={{ ...tableRow, backgroundColor: "#f9fafb" }}>
              <Column style={labelCell}>연락처</Column>
              <Column style={valueCell}>{applicantPhone}</Column>
            </Row>
          )}
          {applicantAgency && (
            <Row style={tableRow}>
              <Column style={labelCell}>소속사</Column>
              <Column style={valueCell}>{applicantAgency}</Column>
            </Row>
          )}

          {/* 특기 */}
          {applicantTraining && <Section><Heading as="h3" style={sectionTitle}>교육·트레이닝</Heading><Text style={{ ...bodyText, whiteSpace: "pre-line" }}>{applicantTraining}</Text></Section>}
          {(introductionUrl || performanceUrl || audioUrl) && <Section>
            <Heading as="h3" style={sectionTitle}>오디션 자료</Heading>
            {[["자기소개 영상", introductionUrl], ["연기·노래·댄스 영상", performanceUrl], ["음성·보컬 샘플", audioUrl]].map(([label, url]) => url ? <Text key={label}><Link href={url}>{label}</Link></Text> : null)}
          </Section>}
          {applicantSpecialty.length > 0 && (
            <Section>
              <Heading as="h3" style={sectionTitle}>
                특기
              </Heading>
              <Section>
                {applicantSpecialty.map((s, i) => (
                  <span key={i} style={tag}>
                    {s}
                  </span>
                ))}
              </Section>
            </Section>
          )}

          {/* 한 줄 소개 */}
          {applicantBio && (
            <Section>
              <Heading as="h3" style={sectionTitle}>
                한 줄 소개
              </Heading>
              <Text style={bodyText}>{applicantBio}</Text>
            </Section>
          )}

          {/* 경력 */}
          {applicantCareer && (
            <Section>
              <Heading as="h3" style={sectionTitle}>
                주요 경력
              </Heading>
              <Text style={bodyText}>{applicantCareer}</Text>
            </Section>
          )}

          {/* 포트폴리오 링크 */}
          {templateId === "career" && photoUrls.length > 0 && <Section>
            <Heading as="h3" style={sectionTitle}>프로필 사진</Heading>
            {[0, 2, 4].filter((start) => start < photoUrls.length).map((start) => <Row key={start}>
              {photoUrls.slice(start, start + 2).map((url, i) => <Column key={i} style={photoGridCell}><Img src={url} alt={`${applicantName} 프로필 사진 ${start + i + 1}`} width="260" style={gridPhoto} /></Column>)}
            </Row>)}
          </Section>}
          {hasLinks && (
            <Section>
              <Heading as="h3" style={sectionTitle}>
                포트폴리오
              </Heading>
              {instagramUrl && (
                <Text style={linkItem}>
                  인스타그램:{" "}
                  <Link href={instagramUrl} style={link}>
                    {instagramUrl}
                  </Link>
                </Text>
              )}
              {youtubeUrl && (
                <Text style={linkItem}>
                  유튜브:{" "}
                  <Link href={youtubeUrl} style={link}>
                    {youtubeUrl}
                  </Link>
                </Text>
              )}
              {otherUrl && (
                <Text style={linkItem}>
                  기타:{" "}
                  <Link href={otherUrl} style={link}>
                    {otherUrl}
                  </Link>
                </Text>
              )}
            </Section>
          )}

          {/* 사진이 안 보일 경우 대비 안내 */}
          {photoUrls.length > 0 && (
            <Text style={photoHint}>
              ※ 사진이 보이지 않으면 메일 상단의 &lsquo;이미지 표시&rsquo;를
              눌러주세요.
            </Text>
          )}
        </Container>

        {/* 푸터 */}
        <Text style={footer}>
          본 메일은 오디션패스(AuditionPass)를 통해 자동 발송되었습니다.
          <br />
          문의: support@auditionpass.co.kr
        </Text>
      </Body>
    </Html>
  );
}

// --- 스타일 ---

const main: React.CSSProperties = {
  backgroundColor: "#F7F4EF",
  fontFamily: "Arial, sans-serif",
  padding: "20px 0",
};

const container: React.CSSProperties = {
  backgroundColor: "#ffffff",
  borderRadius: "12px",
  padding: "32px",
  maxWidth: "600px",
  margin: "0 auto",
  boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
};

const heading: React.CSSProperties = {
  color: "#141110",
  fontSize: "20px",
  margin: "0 0 8px 0",
};

const subtext: React.CSSProperties = {
  color: "#6b7280",
  fontSize: "14px",
  margin: "0 0 20px 0",
};

const heroPhoto: React.CSSProperties = {
  width: "100%",
  maxWidth: "536px",
  height: "auto",
  borderRadius: "8px",
  objectFit: "contain",
  display: "block",
};

const photoGridCell: React.CSSProperties = {
  width: "50%",
  padding: "0 4px",
  verticalAlign: "top",
};

const gridPhoto: React.CSSProperties = {
  width: "100%",
  maxWidth: "260px",
  height: "auto",
  borderRadius: "8px",
  objectFit: "contain",
  display: "block",
};

const hr: React.CSSProperties = {
  border: "none",
  borderTop: "1px solid #e5e7eb",
  margin: "24px 0",
};

const sectionTitle: React.CSSProperties = {
  color: "#374151",
  fontSize: "16px",
  margin: "24px 0 12px 0",
};

const tableRow: React.CSSProperties = {
  width: "100%",
};

const labelCell: React.CSSProperties = {
  padding: "8px 12px",
  fontWeight: "bold",
  color: "#374151",
  width: "80px",
  fontSize: "14px",
};

const valueCell: React.CSSProperties = {
  padding: "8px 12px",
  color: "#4b5563",
  fontSize: "14px",
};

const bodyText: React.CSSProperties = {
  color: "#4b5563",
  fontSize: "14px",
  lineHeight: "1.6",
  margin: 0,
  whiteSpace: "pre-line",
};

const tag: React.CSSProperties = {
  display: "inline-block",
  backgroundColor: "#F0EAE0",
  color: "#46423A",
  fontSize: "13px",
  fontWeight: "bold",
  padding: "4px 12px",
  borderRadius: "9999px",
  margin: "0 6px 6px 0",
};

const linkItem: React.CSSProperties = {
  color: "#4b5563",
  fontSize: "14px",
  margin: "0 0 4px 0",
};

const link: React.CSSProperties = {
  color: "#6366F1",
};

const photoHint: React.CSSProperties = {
  color: "#9CA3AF",
  fontSize: "12px",
  margin: "20px 0 0 0",
};

const footer: React.CSSProperties = {
  color: "#9CA3AF",
  fontSize: "12px",
  textAlign: "center" as const,
  marginTop: "24px",
};
