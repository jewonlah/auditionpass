import {
  Html,
  Body,
  Container,
  Section,
  Text,
  Heading,
  Hr,
  Link,
  Row,
  Column,
} from "@react-email/components";

interface ApplicationEmailProps {
  auditionTitle: string;
  applicantName: string;
  applicantAge: number;
  applicantGender: string;
  applicantHeight?: number | null;
  applicantWeight?: number | null;
  applicantBio?: string | null;
  applicantPhone?: string | null;
  instagramUrl?: string | null;
  youtubeUrl?: string | null;
  otherUrl?: string | null;
  photoUrls: string[];
}

export function ApplicationEmail({
  auditionTitle,
  applicantName,
  applicantAge,
  applicantGender,
  applicantHeight,
  applicantWeight,
  applicantBio,
  applicantPhone,
  instagramUrl,
  youtubeUrl,
  otherUrl,
  photoUrls,
}: ApplicationEmailProps) {
  return (
    <Html lang="ko">
      <Body style={main}>
        <Container style={container}>
          {/* 헤더 */}
          <Heading style={heading}>
            [오디션 지원] {applicantName}
          </Heading>
          <Text style={subtext}>
            안녕하세요, <strong>{auditionTitle}</strong> 오디션에 지원합니다.
          </Text>

          <Hr style={hr} />

          {/* 지원자 정보 */}
          <Heading as="h3" style={sectionTitle}>
            지원자 정보
          </Heading>

          <Row style={tableRow}>
            <Column style={labelCell}>이름</Column>
            <Column style={valueCell}>{applicantName}</Column>
          </Row>
          <Row style={{ ...tableRow, backgroundColor: "#f9fafb" }}>
            <Column style={labelCell}>나이</Column>
            <Column style={valueCell}>{applicantAge}세</Column>
          </Row>
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

          {/* 한 줄 소개 */}
          {applicantBio && (
            <Section>
              <Heading as="h3" style={sectionTitle}>
                한 줄 소개
              </Heading>
              <Text style={bodyText}>{applicantBio}</Text>
            </Section>
          )}

          {/* 포트폴리오 링크 */}
          {(instagramUrl || youtubeUrl || otherUrl) && (
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

          {/* 프로필 사진 */}
          {photoUrls.length > 0 && (
            <Section>
              <Heading as="h3" style={sectionTitle}>
                프로필 사진
              </Heading>
              {photoUrls.map((url, i) => (
                <Text key={i} style={linkItem}>
                  <Link href={url} style={photoLink}>
                    사진 {i + 1} 보기
                  </Link>
                </Text>
              ))}
            </Section>
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
  backgroundColor: "#f8fafc",
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
  color: "#6366F1",
  fontSize: "20px",
  margin: "0 0 8px 0",
};

const subtext: React.CSSProperties = {
  color: "#6b7280",
  fontSize: "14px",
  margin: "0 0 24px 0",
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
  margin: 0,
};

const linkItem: React.CSSProperties = {
  color: "#4b5563",
  fontSize: "14px",
  margin: "0 0 4px 0",
};

const link: React.CSSProperties = {
  color: "#6366F1",
};

const photoLink: React.CSSProperties = {
  color: "#6366F1",
  textDecoration: "underline",
  fontSize: "14px",
};

const footer: React.CSSProperties = {
  color: "#9CA3AF",
  fontSize: "12px",
  textAlign: "center" as const,
  marginTop: "24px",
};
