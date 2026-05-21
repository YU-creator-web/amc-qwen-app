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
  const [realtimeText, setRealtimeText] = useState("");
  const [dialogue, setDialogue] = useState<DialogueLine[]>([]);
  const [botAudioText, setBotAudioText] = useState("");
  const [isBotSpeaking, setIsBotSpeaking] = useState(false);
  const [vadMode, setVadMode] = useState<"auto" | "push">("push");

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const nextAudioTimeRef = useRef<number>(0);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);

  const addLine = useCallback((speaker: "bot" | "user", text: string) => {
    const line: DialogueLine = { speaker, text, timestamp: new Date() };
    setDialogue((prev) => {
      const next = [...prev, line];
      onDialogueUpdate(next);
      return next;
    });
  }, [onDialogueUpdate]);

  const connect = useCallback(async () => {
    const ws = new WebSocket(`${WS_BASE}/ws/voice/${sessionId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext({ sampleRate: 24000 });
      }
    };
    ws.onclose = () => {
      setIsConnected(false);
      setIsRecording(false);
    };

    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      const type: string = msg.type || "";

      if (type === "user_transcript_saved") {
        addLine("user", "");
        setRealtimeText("");
      }
      if (type === "response.audio_transcript.delta") {
        setBotAudioText((t) => t + (msg.delta || ""));
      }
      if (type === "response.audio_transcript.done") {
        const text = (msg.transcript || "").trim();
        if (text) {
          addLine("bot", text);
          setBotAudioText("");
        }
      }
      if (type === "response.created") {
        nextAudioTimeRef.current = 0;
        activeSourcesRef.current = [];
      }
      if (type === "response.audio.delta" && msg.delta) {
        setIsBotSpeaking(true);
        playAudio(msg.delta);
      }
    };
  }, [sessionId, addLine]);

  const playAudio = (base64: string) => {
    const ctx = audioContextRef.current ?? new AudioContext({ sampleRate: 24000 });
    audioContextRef.current = ctx;
    if (ctx.state === "suspended") ctx.resume();
    const raw = atob(base64);
    const buf = new Int16Array(raw.length / 2);
    for (let i = 0; i < buf.length; i++) {
      buf[i] = (raw.charCodeAt(i * 2) | (raw.charCodeAt(i * 2 + 1) << 8));
    }
    const float = new Float32Array(buf.length);
    for (let i = 0; i < buf.length; i++) float[i] = buf[i] / 32768;
    const ab = ctx.createBuffer(1, float.length, 24000);
    ab.copyToChannel(float, 0);
    const source = ctx.createBufferSource();
    source.buffer = ab;
    source.connect(ctx.destination);
    const startTime = Math.max(ctx.currentTime, nextAudioTimeRef.current);
    source.start(startTime);
    nextAudioTimeRef.current = startTime + ab.duration;
    activeSourcesRef.current.push(source);
    source.onended = () => {
      activeSourcesRef.current = activeSourcesRef.current.filter((s) => s !== source);
      if (activeSourcesRef.current.length === 0) {
        setIsBotSpeaking(false);
      }
    };
  };

  const startRecording = async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    const ctx = new AudioContext({ sampleRate: 24000 });
    audioContextRef.current = ctx;
    const source = ctx.createMediaStreamSource(stream);
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;

    processor.onaudioprocess = (e) => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) return;
      const float = e.inputBuffer.getChannelData(0);
      const int16 = new Int16Array(float.length);
      for (let i = 0; i < float.length; i++) {
        int16[i] = Math.max(-32768, Math.min(32767, float[i] * 32768));
      }
      const bytes = new Uint8Array(int16.buffer);
      let bin = "";
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      wsRef.current.send(JSON.stringify({
        type: "input_audio_buffer.append",
        audio: btoa(bin),
      }));
    };

    source.connect(processor);
    processor.connect(ctx.destination);
    setIsRecording(true);
  };

  const stopRecording = () => {
    processorRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (vadMode === "push" && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
      wsRef.current.send(JSON.stringify({ type: "response.create" }));
    }
    setIsRecording(false);
  };

  const switchVadMode = (mode: "auto" | "push") => {
    setVadMode(mode);
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;
    const turnDetection = mode === "auto"
      ? { type: "server_vad", threshold: 0.6, prefix_padding_ms: 300, silence_duration_ms: 2500 }
      : null;
    wsRef.current.send(JSON.stringify({
      type: "session.update",
      session: { turn_detection: turnDetection },
    }));
  };

  const stopBotSpeech = () => {
    activeSourcesRef.current.forEach((s) => { try { s.stop(); } catch {} });
    activeSourcesRef.current = [];
    nextAudioTimeRef.current = 0;
    setBotAudioText("");
    setIsBotSpeaking(false);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "response.cancel" }));
    }
  };

  const handleComplete = () => {
    stopRecording();
    wsRef.current?.close();
    onComplete();
  };

  useEffect(() => {
    connect();
    return () => { wsRef.current?.close(); };
  }, [connect]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON") return;
        e.preventDefault();
        if (isRecording) {
          stopRecording();
        } else if (isConnected && !isBotSpeaking) {
          startRecording();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isRecording, isConnected, isBotSpeaking]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [dialogue, realtimeText, botAudioText, isRecording]);

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
              <div className="text-xs px-3 py-1.5 rounded-full" style={{ backgroundColor: "var(--sky-pale)", color: "var(--sky)" }}>
                ✓ 回答送信済
              </div>
            )}
          </div>
        ))}

        {/* 録音中インジケーター */}
        {isRecording && (
          <div className="flex justify-end">
            <div className="text-xs px-3 py-1.5 rounded-full animate-pulse" style={{ backgroundColor: "#fee2e2", color: "#ef4444" }}>
              🎤 解析中...
            </div>
          </div>
        )}

        {/* ボット応答中 */}
        {botAudioText && (
          <div className="flex justify-start">
            <div className="max-w-[75%] px-4 py-2 rounded-2xl text-sm border-2 border-dashed"
              style={{ borderColor: "var(--sky-light)", color: "var(--navy-light)", borderBottomLeftRadius: 4 }}>
              <div className="text-xs mb-1 opacity-60">🤖 回答中...</div>
              {botAudioText}
            </div>
          </div>
        )}

      </div>

      {/* コントロールバー */}
      <div className="p-4 border-t flex flex-col gap-3" style={{ borderColor: "var(--gray-200)" }}>
        {/* VAD モードトグル */}
        <div className="flex items-center justify-center gap-1 text-xs">
          <button
            onClick={() => switchVadMode("auto")}
            className="px-3 py-1 rounded-full transition-all"
            style={
              vadMode === "auto"
                ? { backgroundColor: "var(--navy)", color: "white" }
                : { backgroundColor: "var(--sky-pale)", color: "var(--navy)" }
            }
          >
            自動検出
          </button>
          <button
            onClick={() => switchVadMode("push")}
            className="px-3 py-1 rounded-full transition-all"
            style={
              vadMode === "push"
                ? { backgroundColor: "var(--navy)", color: "white" }
                : { backgroundColor: "var(--sky-pale)", color: "var(--navy)" }
            }
          >
            手動（OFF で送信）
          </button>
        </div>

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
              disabled={!isConnected || isBotSpeaking}
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
              {vadMode === "push" ? "OFF して送信" : "マイク OFF"}
            </button>
          )}

          {isBotSpeaking && (
            <button
              onClick={stopBotSpeech}
              title="ボットの発話を止める（接続は維持）"
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

        {vadMode === "push" && (
          <p className="text-center text-xs leading-relaxed" style={{ color: "var(--gray-500)" }}>
            準備ができましたらマイクをOnにして回答を開始してください。<br />
            回答が終わったら「OFF して送信」を押してください（ショートカットキー：Space）
          </p>
        )}
      </div>
    </div>
  );
}
