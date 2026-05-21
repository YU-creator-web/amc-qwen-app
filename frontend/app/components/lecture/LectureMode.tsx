"use client";
import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { getCategories, createSession, BusinessCategory, Session } from "@/lib/api";
import VoiceChat from "../extraction/VoiceChat";

type LectureSubMode = "lecture_test" | "lecture_dialogue";

export default function LectureMode() {
  const [categories, setCategories] = useState<BusinessCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [subMode, setSubMode] = useState<LectureSubMode>("lecture_dialogue");
  const [speakerName, setSpeakerName] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCategories().then(setCategories).catch(() => {});
  }, []);

  const handleStart = async () => {
    if (!selectedCategory || !speakerName.trim()) {
      setError("業務区分と名前を入力してください");
      return;
    }
    setError(null);
    const s = await createSession({ business_category_id: selectedCategory, speaker_name: speakerName, mode: subMode });
    setSession(s);
  };

  if (session) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-2 border-b" style={{ borderColor: "var(--gray-200)" }}>
          <div className="text-sm" style={{ color: "var(--gray-500)" }}>
            {subMode === "lecture_test" ? "📝 テスト・問答モード" : "💬 対話モード"}
            　―
            <span className="font-medium" style={{ color: "var(--navy)" }}>{session.speaker_name}</span>
          </div>
          <button
            onClick={() => setSession(null)}
            className="px-4 py-1.5 rounded text-sm border"
            style={{ borderColor: "var(--gray-200)", color: "var(--gray-500)" }}
          >
            終了
          </button>
        </div>
        <div className="flex-1 min-h-0">
          <VoiceChat sessionId={session.id} onDialogueUpdate={() => {}} onComplete={() => setSession(null)} />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto py-8 px-4 space-y-6">
      <h2 className="text-lg font-semibold" style={{ color: "var(--navy)" }}>学習設定</h2>

      {/* サブモード */}
      <div className="space-y-2">
        <label className="text-sm font-medium" style={{ color: "var(--navy-light)" }}>モード</label>
        <div className="grid grid-cols-2 gap-2">
          {(["lecture_dialogue", "lecture_test"] as LectureSubMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setSubMode(m)}
              className="py-3 px-4 rounded-xl border text-sm font-medium transition-all"
              style={
                subMode === m
                  ? { backgroundColor: "var(--sky)", color: "white", borderColor: "var(--sky)" }
                  : { borderColor: "var(--gray-200)", color: "var(--navy-light)" }
              }
            >
              {m === "lecture_dialogue" ? "💬 対話モード" : "📝 テスト・問答モード"}
              <div className="text-xs mt-1 font-normal opacity-70">
                {m === "lecture_dialogue" ? "自由に質問できます" : "ボットが問いかけます"}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 業務区分 */}
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

      {/* 名前 */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium" style={{ color: "var(--navy-light)" }}>あなたの名前</label>
        <input
          type="text"
          placeholder="例：鈴木 花子"
          value={speakerName}
          onChange={(e) => setSpeakerName(e.target.value)}
          className="w-full rounded-lg border px-3 py-2.5 text-sm"
          style={{ borderColor: "var(--gray-200)" }}
        />
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <button
        onClick={handleStart}
        className="w-full py-3 rounded-xl text-white font-medium text-sm"
        style={{ backgroundColor: "var(--sky)" }}
      >
        学習を開始
      </button>
    </div>
  );
}
