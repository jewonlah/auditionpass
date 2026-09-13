"use client";

import { useRef, useState } from "react";
import { FileText, FolderOpen } from "lucide-react";
import { MATERIAL_LABELS, MATERIAL_LIMIT, MATERIAL_TYPES, materialFileError, type Material, type MaterialKind } from "@/lib/materials/files";

export function MaterialLibrary({ initialMaterials, initialError }: { initialMaterials: Material[]; initialError: boolean }) {
  const [materials, setMaterials] = useState(initialMaterials);
  const [loadError, setLoadError] = useState(initialError);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [filter, setFilter] = useState<MaterialKind | "all">("all");
  const [deleting, setDeleting] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const operation = useRef(false);
  const visible = filter === "all" ? materials : materials.filter((material) => material.kind === filter);

  async function run(key: string, work: () => Promise<void>) {
    if (operation.current) return;
    operation.current = true;
    setBusy(key); setError(""); setMessage("");
    try { await work(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "처리하지 못했어요. 다시 시도해 주세요."); }
    finally { operation.current = false; setBusy(""); }
  }

  async function upload(file: File) {
    const invalid = materialFileError(file);
    if (invalid) { setError(invalid); if (input.current) input.current.value = ""; return; }
    await run("upload", async () => {
      const form = new FormData(); form.set("file", file);
      const response = await fetch("/api/materials", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "자료를 올리지 못했어요.");
      setMaterials((previous) => [result.material, ...previous]); setFilter("all");
      setMessage(`${file.name}을 보관했어요.`);
    });
    if (input.current) input.current.value = "";
  }

  async function reload() {
    await run("reload", async () => {
      const response = await fetch("/api/materials", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "자료를 불러오지 못했어요.");
      setMaterials(result.materials); setLoadError(false); setMessage("자료 목록을 불러왔어요.");
    });
  }

  async function download(material: Material) {
    await run(material.id, async () => {
      const response = await fetch(`/api/materials/${material.id}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "다운로드를 준비하지 못했어요.");
      const anchor = document.createElement("a");
      anchor.href = result.url; anchor.download = material.name; anchor.rel = "noreferrer";
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      setMessage("다운로드를 시작했어요.");
    });
  }

  async function remove(material: Material) {
    await run(material.id, async () => {
      const response = await fetch(`/api/materials/${material.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "자료를 삭제하지 못했어요.");
      setMaterials((previous) => previous.filter((item) => item.id !== material.id));
      setDeleting(null); setMessage(`${material.name}을 삭제했어요.`);
      input.current?.focus();
    });
  }

  return <div className="space-y-5" aria-busy={Boolean(busy)}>
    <section className="app-surface space-y-3 border border-gray-200 bg-white p-5" aria-labelledby="upload-title">
      <h2 id="upload-title" className="text-lg font-bold">자료 올리기</h2>
      <p id="material-help" className="text-sm leading-relaxed text-gray-600">JPG·PNG·WebP·PDF·MP4·WebM·MP3·WAV · 파일당 3MB · 최대 100개. 큰 영상은 포트폴리오에 링크로 추가해 주세요.</p>
      <label htmlFor="material-file" className="block font-semibold">보관할 파일 선택</label>
      <input ref={input} id="material-file" type="file" accept={Object.keys(MATERIAL_TYPES).join(",")} aria-describedby="material-help" disabled={Boolean(busy) || loadError || materials.length >= MATERIAL_LIMIT} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} className="block min-h-11 w-full min-w-0 rounded-lg text-sm file:mr-3 file:min-h-11 file:rounded-lg file:border-0 file:bg-primary file:px-4 file:font-semibold file:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary disabled:opacity-50" />
      {materials.length >= MATERIAL_LIMIT ? <p className="text-sm text-gray-600">100개를 모두 사용했어요. 필요 없는 자료를 삭제하면 더 올릴 수 있어요.</p> : null}
      {busy === "upload" ? <p className="text-sm text-primary">파일을 보관하고 있어요…</p> : null}
    </section>
    <div role="status" aria-live="polite" className="text-sm text-gray-600">{message}</div>
    {error ? <p role="alert" className="rounded-xl border border-gray-200 bg-white p-4 text-sm">{error}</p> : null}
    {loadError ? <section role="alert" className="app-surface bg-white p-5"><p>자료를 불러오지 못했어요.</p><button type="button" disabled={Boolean(busy)} onClick={() => void reload()} className="mt-2 min-h-11 font-semibold text-primary">다시 불러오기</button></section> : <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">보관한 자료 <span className="text-gray-500">{materials.length}</span></h2>
        <label className="flex items-center gap-2 text-sm">자료 종류<select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} className="min-h-11 rounded-lg border border-gray-200 bg-white px-3"><option value="all">전체</option>{Object.entries(MATERIAL_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>
      {visible.length ? <ul className="space-y-3">{visible.map((material) => <li key={material.id} className="app-surface border border-gray-200 bg-white p-4">
        <div className="flex items-start gap-3"><FileText aria-hidden="true" className="mt-1 shrink-0 text-primary" size={22} /><div className="min-w-0"><h3 className="break-all font-semibold">{material.name}</h3><p className="mt-1 text-sm text-gray-600">{MATERIAL_LABELS[material.kind]} · {Math.max(1, Math.ceil(material.size_bytes / 1024)).toLocaleString("ko-KR")}KB · {new Date(material.created_at).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}</p></div></div>
        <div className="mt-3 flex flex-wrap gap-4"><button type="button" disabled={Boolean(busy)} onClick={() => void download(material)} aria-label={`${material.name} 다운로드`} className="min-h-11 font-semibold text-primary disabled:opacity-50">다운로드</button><button type="button" disabled={Boolean(busy)} onClick={() => setDeleting(material.id)} aria-label={`${material.name} 삭제`} className="min-h-11 text-gray-600 disabled:opacity-50">삭제</button></div>
        {deleting === material.id ? <div className="mt-2 rounded-xl bg-gray-50 p-3"><p className="text-sm">이 파일을 삭제할까요? 삭제한 파일은 복구할 수 없어요.</p><div className="mt-2 flex gap-4"><button type="button" disabled={Boolean(busy)} onClick={() => void remove(material)} className="min-h-11 font-semibold text-primary">삭제하기</button><button type="button" disabled={Boolean(busy)} onClick={() => setDeleting(null)} className="min-h-11 text-gray-600">취소</button></div></div> : null}
      </li>)}</ul> : <div className="app-surface bg-white px-5 py-10 text-center"><FolderOpen aria-hidden="true" className="mx-auto text-primary" size={32} /><p className="mt-4 font-semibold">{materials.length ? "이 종류의 자료는 아직 없어요" : "아직 보관한 자료가 없어요"}</p><p className="mt-2 text-sm text-gray-600">위에서 파일을 선택하면 여기에 모아 둘게요.</p></div>}
    </>}
  </div>;
}
