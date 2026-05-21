"use client";
import { Brain, Settings } from "lucide-react";

type Mode = "extraction" | "review" | "lecture";

interface HeaderProps {
  activeMode: Mode;
  onModeChange: (mode: Mode) => void;
  onHome: () => void;
  onSettingsOpen: () => void;
}

const MODES: { key: Mode; label: string }[] = [
  { key: "extraction", label: "インタビュー" },
  { key: "review", label: "確認・編集" },
  { key: "lecture", label: "学習" },
];

export default function Header({ activeMode, onModeChange, onHome, onSettingsOpen }: HeaderProps) {
  return (
    <header
      className="sticky top-0 z-50"
      style={{
        background: "linear-gradient(135deg, #051d50 0%, #0a2d6e 50%, #1248a8 100%)",
        boxShadow: "0 4px 20px rgba(5,29,80,0.45)",
      }}
    >
      <div className="max-w-7xl mx-auto px-5 h-14 flex items-center justify-between">
        <button
          onClick={onHome}
          className="flex items-center gap-2.5 font-semibold text-base tracking-wide transition-opacity hover:opacity-75"
          style={{ color: "white", background: "none", border: "none", cursor: "pointer" }}
        >
          <Brain size={20} style={{ color: "var(--sky-light)" }} />
          <span>Demo App</span>
        </button>

        <div className="flex items-center gap-3">
        <nav className="flex gap-1 p-1 rounded-xl" style={{ backgroundColor: "rgba(255,255,255,0.1)" }}>
          {MODES.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => onModeChange(key)}
              className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
              style={
                activeMode === key
                  ? {
                      background: "linear-gradient(135deg, var(--sky) 0%, var(--sky-mid) 100%)",
                      color: "white",
                      boxShadow: "0 2px 10px rgba(91,184,232,0.5)",
                    }
                  : { color: "rgba(255,255,255,0.8)" }
              }
            >
              {label}
            </button>
          ))}
        </nav>
        <button
          onClick={onSettingsOpen}
          className="p-1.5 rounded-lg transition-all hover:opacity-75"
          style={{ color: "rgba(255,255,255,0.8)" }}
          title="設定"
        >
          <Settings size={18} />
        </button>
        </div>
      </div>

      {/* 日向坂カラーのアクセントライン */}
      <div style={{ height: 2.5, background: "linear-gradient(90deg, transparent 0%, #5bb8e8 30%, #a8dcf5 60%, #7ecbf0 80%, transparent 100%)" }} />
    </header>
  );
}
