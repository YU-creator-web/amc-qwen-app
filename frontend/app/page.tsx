"use client";
import { useState } from "react";
import Header from "./components/Header";
import ExtractionMode from "./components/extraction/ExtractionMode";
import ReviewMode from "./components/review/ReviewMode";
import LectureMode from "./components/lecture/LectureMode";
import SettingsModal from "./components/SettingsModal";

type Mode = "extraction" | "review" | "lecture";

export default function Home() {
  const [mode, setMode] = useState<Mode>("extraction");
  const [homeKey, setHomeKey] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [categoryKey, setCategoryKey] = useState(0);

  const handleHome = () => {
    setMode("extraction");
    setHomeKey((k) => k + 1);
  };

  return (
    <div className="flex flex-col h-screen" style={{ background: "linear-gradient(160deg, #dff0f9 0%, #eaf5fc 35%, #f0f8fd 65%, #f5f8fa 100%)" }}>
      <Header activeMode={mode} onModeChange={setMode} onHome={handleHome} onSettingsOpen={() => setSettingsOpen(true)} />
      {settingsOpen && (
        <SettingsModal
          onClose={() => setSettingsOpen(false)}
          onCategoryChange={() => setCategoryKey((k) => k + 1)}
        />
      )}
      <main className="flex-1 overflow-hidden">
        {mode === "extraction" && <ExtractionMode key={`${homeKey}-${categoryKey}`} />}
        {mode === "review" && <ReviewMode />}
        {mode === "lecture" && <LectureMode />}
      </main>
    </div>
  );
}
