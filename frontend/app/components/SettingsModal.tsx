"use client";
import { useState, useEffect } from "react";
import { X, Plus, Trash2, Loader2 } from "lucide-react";
import { getCategories, createCategory, deleteCategory, BusinessCategory } from "@/lib/api";

interface SettingsModalProps {
  onClose: () => void;
  onCategoryChange: () => void;
}

export default function SettingsModal({ onClose, onCategoryChange }: SettingsModalProps) {
  const [categories, setCategories] = useState<BusinessCategory[]>([]);
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCategories().then(setCategories).catch(() => {});
  }, []);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const created = await createCategory(newName.trim());
      setCategories((prev) => [...prev, created]);
      setNewName("");
      onCategoryChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "追加に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (cat: BusinessCategory) => {
    if (!confirm(`「${cat.name}」を削除しますか？\n関連するマニュアル・セッション・データもすべて削除されます。`)) return;
    try {
      await deleteCategory(cat.id);
      setCategories((prev) => prev.filter((c) => c.id !== cat.id));
      onCategoryChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除に失敗しました");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(5,29,80,0.5)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-6 space-y-5"
        style={{
          backgroundColor: "white",
          boxShadow: "0 20px 60px rgba(5,29,80,0.2)",
        }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold" style={{ color: "var(--navy)" }}>設定</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
            <X size={18} style={{ color: "var(--gray-500)" }} />
          </button>
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-medium" style={{ color: "var(--navy-light)" }}>業務区分</h3>

          <ul className="space-y-1.5">
            {categories.map((cat) => (
              <li
                key={cat.id}
                className="flex items-center justify-between px-3 py-2 rounded-lg text-sm"
                style={{ backgroundColor: "var(--sky-pale)", color: "var(--navy)" }}
              >
                <span>{cat.name}</span>
                <button
                  onClick={() => handleDelete(cat)}
                  className="p-1 rounded hover:bg-red-50 shrink-0"
                  title="削除"
                >
                  <Trash2 size={14} style={{ color: "#ef4444" }} />
                </button>
              </li>
            ))}
          </ul>

          <div className="flex gap-2">
            <input
              type="text"
              placeholder="新しい業務区分名"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
              className="flex-1 rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: "var(--gray-200)" }}
            />
            <button
              onClick={handleAdd}
              disabled={loading || !newName.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40"
              style={{ backgroundColor: "var(--sky)" }}
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              追加
            </button>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      </div>
    </div>
  );
}
