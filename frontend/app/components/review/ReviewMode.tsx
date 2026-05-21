"use client";
import { useEffect, useState } from "react";
import { Pencil, Trash2, Save, X, ChevronDown, Loader2, CheckCircle } from "lucide-react";
import {
  getCategories,
  getTacitKnowledge,
  updateTacitKnowledge,
  deleteTacitKnowledge,
  getSessions,
  deleteSession,
  getDialogueLogs,
  structureSession,
  BusinessCategory,
  TacitKnowledge,
  Session,
  DialogueLog,
} from "@/lib/api";

export default function ReviewMode() {
  const [categories, setCategories] = useState<BusinessCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [allKnowledge, setAllKnowledge] = useState<TacitKnowledge[]>([]);
  const [allSessions, setAllSessions] = useState<Session[]>([]);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [logs, setLogs] = useState<DialogueLog[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<TacitKnowledge>>({});
  const [tab, setTab] = useState<"knowledge" | "history">("knowledge");
  const [historyModeFilter, setHistoryModeFilter] = useState<"extraction" | "lecture">("extraction");
  const [extracting, setExtracting] = useState(false);
  const [extractResult, setExtractResult] = useState<string | null>(null);

  const loadAll = () => {
    getCategories().then(setCategories).catch(() => {});
    getTacitKnowledge().then(setAllKnowledge).catch(() => {});
    getSessions().then(setAllSessions).catch(() => {});
  };

  useEffect(() => { loadAll(); }, []);

  // カテゴリでフィルタリング（未選択時は全件表示）
  const knowledgeList = selectedCategory
    ? allKnowledge.filter((k) => k.business_category_id === selectedCategory)
    : allKnowledge;
  const sessions = (selectedCategory
    ? allSessions.filter((s) => s.business_category_id === selectedCategory)
    : allSessions
  ).filter((s) =>
    historyModeFilter === "extraction"
      ? s.mode === "extraction"
      : s.mode === "lecture_test" || s.mode === "lecture_dialogue"
  );

  const handleEdit = (item: TacitKnowledge) => {
    setEditingId(item.id);
    setEditForm({
      business_flow_name: item.business_flow_name,
      judgment_criteria: item.judgment_criteria,
      applicable_conditions: item.applicable_conditions ?? "",
      notes: item.notes ?? "",
    });
  };

  const handleSave = async (id: number) => {
    await updateTacitKnowledge(id, editForm);
    getTacitKnowledge().then(setAllKnowledge).catch(() => {});
    setEditingId(null);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("このデータを削除しますか？")) return;
    await deleteTacitKnowledge(id);
    setAllKnowledge((prev) => prev.filter((k) => k.id !== id));
  };

  const handleDeleteSession = async (s: Session) => {
    if (!confirm(`「${s.speaker_name}」のセッションを削除しますか？\nこのセッションの会話ログも削除されます。`)) return;
    await deleteSession(s.id);
    setAllSessions((prev) => prev.filter((x) => x.id !== s.id));
    if (selectedSession?.id === s.id) {
      setSelectedSession(null);
      setLogs([]);
      setExtractResult(null);
    }
  };

  const handleSelectSession = async (s: Session) => {
    setSelectedSession(s);
    setExtractResult(null);
    const l = await getDialogueLogs(s.id);
    setLogs(l);
  };

  const handleReExtract = async () => {
    if (!selectedSession) return;
    setExtracting(true);
    setExtractResult(null);
    try {
      const result = await structureSession(selectedSession.id);
      setExtractResult(`${result.structured.length} 件のデータを解析しました`);
      getTacitKnowledge().then(setAllKnowledge).catch(() => {});
    } catch (e) {
      setExtractResult(`失敗: ${e instanceof Error ? e.message : "不明なエラー"}`);
    } finally {
      setExtracting(false);
    }
  };

  const formatJST = (iso: string) => {
    const utc = /[Z+]/.test(iso) ? iso : iso + "Z";
    return new Date(utc).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="h-full flex flex-col">
      {/* カテゴリ選択 */}
      <div className="p-4 border-b flex items-center gap-3" style={{ borderColor: "var(--gray-200)" }}>
        <div className="relative w-52">
          <select
            value={selectedCategory ?? ""}
            onChange={(e) => setSelectedCategory(Number(e.target.value) || null)}
            className="w-full appearance-none rounded-lg border px-3 py-2 text-sm pr-8"
            style={{ borderColor: "var(--gray-200)", backgroundColor: "white" }}
          >
            <option value="">すべての業務区分</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <ChevronDown size={13} className="absolute right-2.5 top-2.5 pointer-events-none" style={{ color: "var(--gray-500)" }} />
        </div>

        <div className="flex gap-1 ml-auto">
          {(["knowledge", "history"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="px-4 py-1.5 rounded text-sm font-medium transition-colors"
              style={
                tab === t
                  ? { backgroundColor: "var(--navy)", color: "white" }
                  : { color: "var(--gray-500)" }
              }
            >
              {t === "knowledge" ? "データ一覧" : "セッション履歴"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
        {/* データ一覧 */}
        {tab === "knowledge" && (
          <div className="space-y-3">
            {knowledgeList.length === 0 && (
              <p className="text-center text-sm mt-8" style={{ color: "var(--gray-500)" }}>データがまだありません</p>
            )}
            {knowledgeList.map((item) => (
              <div key={item.id} className="rounded-xl border p-4" style={{ borderColor: "var(--gray-200)", backgroundColor: "white" }}>
                {editingId === item.id ? (
                  <div className="space-y-2">
                    <input
                      className="w-full border rounded px-2 py-1 text-sm"
                      style={{ borderColor: "var(--gray-200)" }}
                      value={editForm.business_flow_name ?? ""}
                      onChange={(e) => setEditForm((f) => ({ ...f, business_flow_name: e.target.value }))}
                      placeholder="業務フロー名"
                    />
                    <textarea
                      className="w-full border rounded px-2 py-1 text-sm"
                      style={{ borderColor: "var(--gray-200)" }}
                      rows={3}
                      value={editForm.judgment_criteria ?? ""}
                      onChange={(e) => setEditForm((f) => ({ ...f, judgment_criteria: e.target.value }))}
                      placeholder="判断基準"
                    />
                    <textarea
                      className="w-full border rounded px-2 py-1 text-sm"
                      style={{ borderColor: "var(--gray-200)" }}
                      rows={2}
                      value={editForm.applicable_conditions ?? ""}
                      onChange={(e) => setEditForm((f) => ({ ...f, applicable_conditions: e.target.value }))}
                      placeholder="適用条件"
                    />
                    <textarea
                      className="w-full border rounded px-2 py-1 text-sm"
                      style={{ borderColor: "var(--gray-200)" }}
                      rows={2}
                      value={editForm.notes ?? ""}
                      onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                      placeholder="備考"
                    />
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setEditingId(null)} className="flex items-center gap-1 text-sm px-3 py-1.5 rounded border" style={{ borderColor: "var(--gray-200)", color: "var(--gray-500)" }}>
                        <X size={13} /> キャンセル
                      </button>
                      <button onClick={() => handleSave(item.id)} className="flex items-center gap-1 text-sm px-3 py-1.5 rounded text-white" style={{ backgroundColor: "var(--sky)" }}>
                        <Save size={13} /> 保存
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium text-sm" style={{ color: "var(--navy)" }}>{item.business_flow_name}</span>
                      <div className="flex gap-1.5 shrink-0">
                        <button onClick={() => handleEdit(item)} className="p-1 rounded hover:bg-gray-100"><Pencil size={14} style={{ color: "var(--sky)" }} /></button>
                        <button onClick={() => handleDelete(item.id)} className="p-1 rounded hover:bg-gray-100"><Trash2 size={14} style={{ color: "#ef4444" }} /></button>
                      </div>
                    </div>
                    <p className="mt-2 text-sm" style={{ color: "var(--navy-light)" }}>{item.judgment_criteria}</p>
                    {item.applicable_conditions && (
                      <p className="mt-1 text-xs" style={{ color: "var(--gray-500)" }}>条件: {item.applicable_conditions}</p>
                    )}
                    {item.notes && (
                      <p className="mt-0.5 text-xs" style={{ color: "var(--gray-500)" }}>備考: {item.notes}</p>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {/* セッション履歴 */}
        {tab === "history" && (
          <div className="flex gap-4 h-full">
            <div className="w-64 shrink-0 flex flex-col gap-2 overflow-y-auto scrollbar-thin">
              {/* モードフィルタータブ */}
              <div className="flex rounded-lg p-0.5" style={{ backgroundColor: "var(--sky-pale)" }}>
                {(["extraction", "lecture"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => { setHistoryModeFilter(m); setSelectedSession(null); setLogs([]); setExtractResult(null); }}
                    className="flex-1 py-1.5 rounded-md text-xs font-medium transition-all"
                    style={
                      historyModeFilter === m
                        ? { backgroundColor: "var(--navy)", color: "white", boxShadow: "0 1px 4px rgba(30,58,95,0.2)" }
                        : { color: "var(--navy-light)" }
                    }
                  >
                    {m === "extraction" ? "インタビュー" : "学習"}
                  </button>
                ))}
              </div>

              {sessions.length === 0 && (
                <p className="text-sm" style={{ color: "var(--gray-500)" }}>セッションがまだありません</p>
              )}
              {sessions.map((s) => (
                <div
                  key={s.id}
                  className="relative group rounded-lg border text-sm transition-colors"
                  style={{
                    borderColor: selectedSession?.id === s.id ? "var(--sky)" : "var(--gray-200)",
                    backgroundColor: selectedSession?.id === s.id ? "var(--sky-pale)" : "white",
                  }}
                >
                  <button
                    onClick={() => handleSelectSession(s)}
                    className="w-full text-left p-3 pr-8"
                  >
                    <div className="font-medium" style={{ color: "var(--navy)" }}>{s.speaker_name}</div>
                    <div className="text-xs mt-0.5" style={{ color: "var(--gray-500)" }}>
                      {formatJST(s.started_at)}
                    </div>
                  </button>
                  <button
                    onClick={() => handleDeleteSession(s)}
                    className="absolute right-2 top-2.5 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-50 transition-opacity"
                    title="削除"
                  >
                    <Trash2 size={13} style={{ color: "#ef4444" }} />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex-1 flex flex-col min-h-0">
              {!selectedSession && <p className="text-sm" style={{ color: "var(--gray-500)" }}>セッションを選択してください</p>}

              {/* 抽出ボタン：スクロール外の固定ヘッダー */}
              {selectedSession && (
                <div className="shrink-0 flex items-center justify-between mb-3 pb-2 border-b" style={{ borderColor: "var(--gray-200)" }}>
                  <span className="text-xs" style={{ color: "var(--gray-500)" }}>
                    {logs.length} 件の発話ログ
                  </span>
                  <div className="flex items-center gap-2">
                    {extractResult && (
                      <span className="text-xs flex items-center gap-1" style={{ color: extractResult.includes("失敗") ? "#ef4444" : "#22c55e" }}>
                        {!extractResult.includes("失敗") && <CheckCircle size={12} />}
                        {extractResult}
                      </span>
                    )}
                    {historyModeFilter === "extraction" && (
                      <button
                        onClick={handleReExtract}
                        disabled={extracting || logs.length === 0}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium text-white disabled:opacity-40"
                        style={{ backgroundColor: "var(--sky)" }}
                      >
                        {extracting ? <Loader2 size={12} className="animate-spin" /> : null}
                        解析・保存
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* スクロール可能なログ一覧 */}
              <div className="flex-1 overflow-y-auto space-y-2 scrollbar-thin">
                {logs.map((log) => (
                  <div key={log.id} className={`flex ${log.speaker === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className="max-w-[75%] px-3 py-2 rounded-xl text-sm"
                      style={
                        log.speaker === "bot"
                          ? { backgroundColor: "var(--sky-pale)", color: "var(--navy)" }
                          : { backgroundColor: "var(--navy)", color: "white" }
                      }
                    >
                      <div className="text-xs mb-0.5 opacity-60">{log.speaker === "bot" ? "ボット" : "話者"}</div>
                      {log.text}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
