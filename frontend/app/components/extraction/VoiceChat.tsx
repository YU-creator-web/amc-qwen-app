"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { Mic, MicOff, CheckCircle, VolumeX } from "lucide-react";

interface DialogueLine {
  speaker: "bot" | "user";
  text: string;
  timestamp: Date;
}

interface VoiceChatProps {
  sessionId: number;
  onDialogueUpdate: (lines: DialogueLine[]) => void;
  onComplete: () => void;
}

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";

export default function VoiceChat({ sessionId, onDialogueUpdate, onComplete }: VoiceChatProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isBotSpeaking, setIsBotSpeaking] = useState(false);
  const [botStreamText, setBotStreamText] = useState("");
  const [userTranscript, setUserTranscript] = useState("");
  const [dialogue, setDialogue] = useState<DialogueLine[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pcmChunksRef = useRef<Int16Array[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const addLine = useCallback((speaker: "bot" | "user", text: string) => {
    const line: DialogueLine = { speaker, text, timestamp: new Date() };
    setDialogue((prev) => {
      const next = [...prev, line];
      onDialogueUpdate(next);
      return next;
    });
  }, [onDialogueUpdate]);

  const speakText = useCallback((text: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ja-JP";
    utterance.rate = 1.05;
    utterance.onstart = () => setIsBotSpeaking(true);
    utterance.onend = () => setIsBotSpeaking(false);
    utterance.onerror = () => setIsBotSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }, []);

  const stopBotSpeech = useCallback(() => {
    window.speechSynthesis?.cancel();
    setIsBotSpeaking(false);
  }, []);

  const connect = useCallback(() => {
    const ws = new WebSocket(`${WS_BASE}/ws/voice/${sessionId}`);
    wsRef.current = ws;

    ws.onopen = () => setIsConnected(true);
    ws.onclose = () => {
      setIsConnected(false);
      setIsRecording(false);
    };

    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      const type: string = msg.type || "";

      if (type === "bot_delta") {
        setBotStreamText((t) => t + (msg.text || ""));
      }
      if (type === "bot_done") {
        const text = (msg.text || "").trim();
        if (text) {
          addLine("bot", text);
          setBotStreamText("");
          speakText(text);
        }
      }
      if (type === "transcribing") {
        setIsTranscribing(true);
        setUserTranscript("");
      }
      if (type === "transcript") {
        setIsTranscribing(false);
        const text = (msg.text || "").trim();
        if (text) {
          setUserTranscript(text);
          addLine("user", text);
        } else if (msg.error) {
          setUserTranscript(msg.error);
        }
      }
      if (type === "error") {
        setIsTranscribing(false);
      }
    };
  }, [sessionId, addLine, speakText]);

  const startRecording = async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    stopBotSpeech();

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    const ctx = new AudioContext({ sampleRate: 24000 });
    audioContextRef.current = ctx;
    const source = ctx.createMediaStreamSource(stream);
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;
    pcmChunksRef.current = [];

    processor.onaudioprocess = (e) => {
      const float = e.inputBuffer.getChannelData(0);
      const int16 = new Int16Array(float.length);
      for (let i = 0; i < float.length; i++) {
        int16[i] = Math.max(-32768, Math.min(32767, float[i] * 32768));
      }
      pcmChunksRef.current.push(int16);
    };

    source.connect(processor);
    processor.connect(ctx.destination);
    setIsRecording(true);
    setUserTranscript("");
  };

  const stopRecording = () => {
    processorRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setIsRecording(false);

    const chunks = pcmChunksRef.current;
    if (chunks.length === 0 || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
    const merged = new Int16Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    const bytes = new Uint8Array(merged.buffer);
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    const base64 = btoa(bin);

    wsRef.current.send(JSON.stringify({
      type: "audio_data",
      audio: base64,
      sample_rate: 24000,
    }));
  };

  const handleComplete = () => {
    if (isRecording) stopRecording();
    stopBotSpeech();
    wsRef.current?.close();
    onComplete();
  };

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
      window.speechSynthesis?.cancel();
    };
  }, [connect]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON") return;
        e.preventDefault();
        if (isRecording) {
          stopRecording();
        } else if (isConnected && !isBotSpeaking && !isTranscribing) {
          startRecording();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isRecording, isConnected, isBotSpeaking, isTranscribing]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [dialogue, botStreamText, userTranscript, isRecording]);

  return (
    <div className="flex flex-col h-full">
      {/* 対話表示エリア */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin"
        style={{ minHeight: 0 }}
      >
        {dialogue.map((line, i) => (
          <div key={i} className={`flex ${line.speaker === "user" ? "justify-end" : "justify-start"}`}>
            {line.speaker === "bot" ? (
              <div
                className="max-w-[75%] px-4 py-2 rounded-2xl text-sm leading-relaxed"
                style={{ backgroundColor: "var(--sky-pale)", color: "var(--navy)", borderBottomLeftRadius: 4 }}
              >
                <div className="text-xs mb-1 opacity-60">🤖 ボット</div>
                {line.text}
              </div>
            ) : (
              <div
                className="max-w-[75%] px-4 py-2 rounded-2xl text-sm leading-relaxed text-right"
                style={{ backgroundColor: "#e0f2fe", color: "#0369a1", borderBottomRightRadius: 4 }}
              >
                <div className="text-xs mb-1 opacity-60">🎤 あなた</div>
                {line.text}
              </div>
            )}
          </div>
        ))}

        {/* ボット応答ストリーミング中 */}
        {botStreamText && (
          <div className="flex justify-start">
            <div className="max-w-[75%] px-4 py-2 rounded-2xl text-sm border-2 border-dashed"
              style={{ borderColor: "var(--sky-light)", color: "var(--navy-light)", borderBottomLeftRadius: 4 }}>
              <div className="text-xs mb-1 opacity-60">🤖 回答中...</div>
              {botStreamText}
            </div>
          </div>
        )}

        {/* 音声認識中 */}
        {isTranscribing && (
          <div className="flex justify-end">
            <div className="text-xs px-3 py-1.5 rounded-full animate-pulse" style={{ backgroundColor: "#fef9c3", color: "#92400e" }}>
              ✍️ 認識中...
            </div>
          </div>
        )}

        {/* 録音中インジケーター */}
        {isRecording && (
          <div className="flex justify-end">
            <div className="text-xs px-3 py-1.5 rounded-full animate-pulse" style={{ backgroundColor: "#fee2e2", color: "#ef4444" }}>
              🎤 録音中...
            </div>
          </div>
        )}
      </div>

      {/* コントロールバー */}
      <div className="p-4 border-t flex flex-col gap-3" style={{ borderColor: "var(--gray-200)" }}>
        <div className="flex items-center justify-center gap-4">
          <div className="flex items-center gap-2 text-xs" style={{ color: "var(--gray-500)" }}>
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ backgroundColor: isConnected ? "#22c55e" : "#ef4444" }}
            />
            {isConnected ? "接続中" : "未接続"}
          </div>

          {!isRecording ? (
            <button
              onClick={startRecording}
              disabled={!isConnected || isBotSpeaking || isTranscribing}
              className="flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-medium transition-all disabled:opacity-40"
              style={{ backgroundColor: "var(--sky)", color: "white" }}
            >
              <Mic size={16} />
              マイク ON
            </button>
          ) : (
            <button
              onClick={stopRecording}
              className="flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-medium animate-pulse"
              style={{ backgroundColor: "#ef4444", color: "white" }}
            >
              <MicOff size={16} />
              OFF して送信
            </button>
          )}

          {isBotSpeaking && (
            <button
              onClick={stopBotSpeech}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium border-2 transition-all"
              style={{ borderColor: "#f59e0b", color: "#f59e0b", backgroundColor: "#fffbeb" }}
            >
              <VolumeX size={14} />
              発話を止める
            </button>
          )}

          <button
            onClick={handleComplete}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium text-white transition-all hover:opacity-90"
            style={{ background: "linear-gradient(135deg, var(--navy) 0%, var(--navy-light) 100%)", boxShadow: "0 2px 10px rgba(30,58,95,0.3)" }}
          >
            <CheckCircle size={15} />
            完了
          </button>
        </div>

        <p className="text-center text-xs leading-relaxed" style={{ color: "var(--gray-500)" }}>
          マイクをOnにして回答を開始してください。回答が終わったら「OFF して送信」を押してください（ショートカットキー：Space）
        </p>
      </div>
    </div>
  );
}
