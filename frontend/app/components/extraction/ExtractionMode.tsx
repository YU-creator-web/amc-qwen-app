"use client";
import { useEffect, useState } from "react";
import { Upload, ChevronDown, Loader2, CheckCircle, AlertCircle, Trash2 } from "lucide-react";
import {
  getCategories,
  getManuals,
  uploadManual,
  deleteManual,
  createSession,
  endSession,
  structureSession,
  BusinessCategory,
  Manual,
  Session,
} from "@/lib/api";
import VoiceChat from "./VoiceChat";

type Step = "setup" | "chatting" | "structuring" | "done" | "error";

export default function ExtractionMode() {
  const [categories, setCategories] = useState<BusinessCategory[]>([]);
  const [manuals, setManuals] = useState<Manual[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [speakerName, setSpeakerName] = useState("");
  const [deepDiveLevel, setDeepDiveLevel] = useState(4);
  const [session, setSession] = useState<Session | null>(null);
  const [step, setStep] = useState<Step>("setup");
  const [structuredCount, setStructuredCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCategories().then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedCategory) {
      getManuals(selectedCategory).then(setManuals).catch(() => {});
    }
  }, [selectedCategory]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedCategory || !e.target.files?.[0]) return;
    await uploadManual(selectedCategory, e.target.files[0]);
    const updated = await getManuals(selectedCategory);
    setManuals(updated);
    e.target.value = "";
  };

  const handleDeleteManual = async (m: Manual) => {
    if (!confirm(`「${m.file_name}」を削除しますか？`)) return;
    await deleteManual(m.id);
    setManuals((prev) => prev.filter((x) => x.id !== m.id));
  };

  const handleStart = async () => {
    if (!selectedCategory || !speakerName.trim()) {
      setError("業務区分と話者名を入力してください");
      return;
    }
    setError(null);
    const s = await createSession({ business_category_id: selectedCategory, speaker_name: speakerName, mode: "extraction", deep_dive_level: deepDiveLevel });
    setSession(s);
    setStep("chatting");
  };

  const handleEndSession = async () => {
    if (!session) return;
    setStep("structuring");
    try {
      await endSession(session.id);
      const result = await structureSession(session.id);
      setStructuredCount(result.structured.length);
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
      setStep("error");
    }
  };

  if (step === "chatting" && session) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-4 py-2 border-b text-sm" style={{ borderColor: "var(--gray-200)", color: "var(--gray-500)" }}>
          話者：<span className="font-medium" style={{ color: "var(--navy)" }}>{session.speaker_name}</span>
          　業務区分：<span className="font-medium" style={{ color: "var(--navy)" }}>
            {categories.find((c) => c.id === session.business_category_id)?.name}
          </span>
        </div>
        <div className="flex-1 min-h-0">
          <VoiceChat sessionId={session.id} onDialogueUpdate={() => {}} onComplete={handleEndSession} />
        </div>
      </div>
    );
  }

  if (step === "structuring") {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <Loader2 size={40} className="animate-spin" style={{ color: "var(--sky)" }} />
        <p className="text-base" style={{ color: "var(--navy-light)" }}>対話内容を解析・構造化中...</p>
      </div>
    );
  }

  if (step === "error") {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <AlertCircle size={48} style={{ color: "#ef4444" }} />
        <p className="text-base font-medium" style={{ color: "var(--navy)" }}>解析に失敗しました</p>
        <p className="text-sm" style={{ color: "var(--gray-500)" }}>{error}</p>
        <p className="text-xs" style={{ color: "var(--gray-500)" }}>
          会話ログは保存済みです。「確認・編集」→「セッション履歴」から再度実行できます。
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => { setStep("chatting"); setError(null); }}
            className="px-5 py-2 rounded-full text-sm font-medium border"
            style={{ borderColor: "var(--gray-200)", color: "var(--navy)" }}
          >
            会話に戻る
          </button>
          <button
            onClick={() => { setStep("setup"); setSession(null); setSpeakerName(""); setError(null); }}
            className="px-5 py-2 rounded-full text-sm font-medium text-white"
            style={{ backgroundColor: "var(--sky)" }}
          >
            新しいセッション
          </button>
        </div>
      </div>
    );
  }

  if (step === "done") {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <CheckCircle size={48} style={{ color: "#22c55e" }} />
        <p className="text-lg font-semibold" style={{ color: "var(--navy)" }}>
          {structuredCount} 件のデータを保存しました
        </p>
        <button
          onClick={() => { setStep("setup"); setSession(null); setSpeakerName(""); }}
          className="px-6 py-2 rounded-full text-sm font-medium text-white"
          style={{ backgroundColor: "var(--sky)" }}
        >
          新しいセッションを開始
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto py-10 px-4 space-y-6">
      <div
        className="rounded-2xl p-6 space-y-6"
        style={{
          backgroundColor: "rgba(255,255,255,0.75)",
          backdropFilter: "blur(12px)",
          boxShadow: "0 4px 24px rgba(30,58,95,0.08), 0 1px 4px rgba(30,58,95,0.06)",
          border: "1px solid rgba(59,159,209,0.15)",
        }}
      >
      <h2 className="text-lg font-semibold" style={{ color: "var(--navy)" }}>インタビュー設定</h2>

      {/* 業務区分選択 */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium" style={{ color: "var(--navy-light)" }}>業務区分</label>
        <div className="relative">
          <select
            value={selectedCategory ?? ""}
            onChange={(e) => setSelectedCategory(Number(e.target.value) || null)}
            className="w-full appearance-none rounded-lg border px-3 py-2.5 text-sm pr-8"
            style={{ borderColor: "var(--gray-200)", backgroundColor: "white" }}
          >
            <option value="">選択してください</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-2.5 top-3 pointer-events-none" style={{ color: "var(--gray-500)" }} />
        </div>
      </div>

      {/* マニュアル */}
      {selectedCategory && (
        <div className="space-y-2">
          <label className="text-sm font-medium" style={{ color: "var(--navy-light)" }}>
            業務マニュアル（PDF / DOCX / TXT）
          </label>
          {manuals.length > 0 && (
            <ul className="space-y-1">
              {manuals.map((m) => (
                <li key={m.id} className="text-xs px-3 py-1.5 rounded flex items-center justify-between gap-2" style={{ backgroundColor: "var(--sky-pale)", color: "var(--navy-light)" }}>
                  <span>📄 {m.file_name}</span>
                  <button onClick={() => handleDeleteManual(m)} className="p-0.5 rounded hover:bg-red-50 shrink-0" title="削除">
                    <Trash2 size={12} style={{ color: "#ef4444" }} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <label className="flex items-center gap-2 cursor-pointer text-sm px-3 py-2 rounded-lg border border-dashed"
            style={{ borderColor: "var(--sky)", color: "var(--sky)" }}>
            <Upload size={14} />
            マニュアルをアップロード
            <input type="file" accept=".pdf,.docx,.txt" className="hidden" onChange={handleUpload} />
          </label>
        </div>
      )}

      {/* 話者名 */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium" style={{ color: "var(--navy-light)" }}>話者名</label>
        <input
          type="text"
          placeholder="例：田中 太郎"
          value={speakerName}
          onChange={(e) => setSpeakerName(e.target.value)}
          className="w-full rounded-lg border px-3 py-2.5 text-sm"
          style={{ borderColor: "var(--gray-200)" }}
        />
      </div>

      {/* 深堀りレベル */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium" style={{ color: "var(--navy-light)" }}>深堀りレベル</label>
          <span className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={{ backgroundColor: "var(--sky-pale)", color: "var(--sky)" }}>
            {deepDiveLevel === 2 ? "浅め" : deepDiveLevel <= 3 ? "やや浅め" : deepDiveLevel === 4 ? "標準" : deepDiveLevel === 5 ? "やや深め" : "深め"}
          </span>
        </div>
        <p className="text-xs" style={{ color: "var(--gray-500)" }}>
          同じテーマに対して最大何回まで深堀り質問するか
        </p>
        <div className="flex gap-1.5">
          {[2, 3, 4, 5, 6].map((level) => (
            <button
              key={level}
              onClick={() => setDeepDiveLevel(level)}
              className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
              style={
                deepDiveLevel === level
                  ? { backgroundColor: "var(--navy)", color: "white", boxShadow: "0 2px 8px rgba(30,58,95,0.3)" }
                  : { backgroundColor: "var(--sky-pale)", color: "var(--navy-light)" }
              }
            >
              {level}回
            </button>
          ))}
        </div>
        <div className="flex justify-between text-xs px-0.5" style={{ color: "var(--gray-500)" }}>
          <span>浅め</span>
          <span>標準</span>
          <span>深め</span>
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <button
        onClick={handleStart}
        className="w-full py-3 rounded-xl text-white font-medium text-sm transition-all hover:opacity-90"
        style={{
          background: "linear-gradient(135deg, var(--navy) 0%, var(--navy-light) 100%)",
          boxShadow: "0 4px 14px rgba(30,58,95,0.3)",
        }}
      >
        セッション開始
      </button>
      </div>
    </div>
  );
}
