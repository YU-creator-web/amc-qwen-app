const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export type BusinessCategory = { id: number; name: string };
export type Manual = { id: number; business_category_id: number; file_name: string };
export type SessionMode = "extraction" | "lecture_test" | "lecture_dialogue";

export type Session = {
  id: number;
  business_category_id: number;
  speaker_name: string;
  mode: SessionMode;
  deep_dive_level: number;
  started_at: string;
  ended_at: string | null;
};

export type DialogueLog = {
  id: number;
  speaker: "bot" | "user";
  text: string;
  timestamp: string;
};

export type TacitKnowledge = {
  id: number;
  business_category_id: number;
  session_id: number | null;
  business_flow_name: string;
  judgment_criteria: string;
  applicable_conditions: string | null;
  notes: string | null;
};

// Categories
export const getCategories = () => apiFetch<BusinessCategory[]>("/api/categories");
export const createCategory = (name: string) =>
  apiFetch<BusinessCategory>("/api/categories", { method: "POST", body: JSON.stringify({ name }) });
export const deleteCategory = (id: number) =>
  apiFetch(`/api/categories/${id}`, { method: "DELETE" });

// Manuals
export const getManuals = (categoryId: number) =>
  apiFetch<Manual[]>(`/api/manuals?category_id=${categoryId}`);
export const uploadManual = (categoryId: number, file: File) => {
  const form = new FormData();
  form.append("category_id", String(categoryId));
  form.append("file", file);
  return fetch(`${BASE_URL}/api/manuals`, { method: "POST", body: form }).then((r) => r.json());
};
export const deleteManual = (id: number) =>
  apiFetch(`/api/manuals/${id}`, { method: "DELETE" });

// Sessions
export const getSessions = (categoryId?: number) =>
  apiFetch<Session[]>(`/api/sessions${categoryId ? `?category_id=${categoryId}` : ""}`);
export const createSession = (body: { business_category_id: number; speaker_name: string; mode: SessionMode; deep_dive_level?: number }) =>
  apiFetch<Session>("/api/sessions", { method: "POST", body: JSON.stringify(body) });
export const endSession = (id: number) =>
  apiFetch(`/api/sessions/${id}/end`, { method: "POST" });
export const deleteSession = (id: number) =>
  apiFetch(`/api/sessions/${id}`, { method: "DELETE" });
export const getDialogueLogs = (sessionId: number) =>
  apiFetch<DialogueLog[]>(`/api/sessions/${sessionId}/logs`);
export const structureSession = (sessionId: number) =>
  apiFetch<{ structured: TacitKnowledge[] }>(`/api/sessions/${sessionId}/structure`, { method: "POST" });

// Tacit Knowledge
export const getTacitKnowledge = (categoryId?: number) =>
  apiFetch<TacitKnowledge[]>(`/api/tacit-knowledge${categoryId ? `?category_id=${categoryId}` : ""}`);
export const updateTacitKnowledge = (id: number, body: Partial<TacitKnowledge>) =>
  apiFetch<TacitKnowledge>(`/api/tacit-knowledge/${id}`, { method: "PUT", body: JSON.stringify(body) });
export const deleteTacitKnowledge = (id: number) =>
  apiFetch(`/api/tacit-knowledge/${id}`, { method: "DELETE" });
