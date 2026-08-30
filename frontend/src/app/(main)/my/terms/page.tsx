import { redirect } from "next/navigation";

// 2026-08-29: 본문이 공개 라우트 `/terms` 로 이동했다. 가입 전에 읽어야 하는 문서이고
// robots 가 `/my` 를 차단하고 있어 검색에도 안 잡혔다. 기존 링크 보존용 리다이렉트.
export default function Page() {
  redirect("/terms");
}
