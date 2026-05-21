import io
import wave
import base64
import json
import logging
from openai import OpenAI
from database import settings, TacitKnowledge, Manual, DialogueLog
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

_whisper_model = None


def get_whisper_model():
    global _whisper_model
    if _whisper_model is None:
        from faster_whisper import WhisperModel
        logger.info(f"Loading Whisper model: {settings.WHISPER_MODEL} on {settings.WHISPER_DEVICE}")
        _whisper_model = WhisperModel(
            settings.WHISPER_MODEL,
            device=settings.WHISPER_DEVICE,
            compute_type="int8",
        )
        logger.info("Whisper model loaded.")
    return _whisper_model


def get_ollama_client() -> OpenAI:
    return OpenAI(base_url=settings.OLLAMA_BASE_URL, api_key="ollama")


def transcribe_audio(pcm16_base64: str, sample_rate: int = 24000) -> str:
    raw = base64.b64decode(pcm16_base64)

    wav_buffer = io.BytesIO()
    with wave.open(wav_buffer, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(raw)
    wav_buffer.seek(0)

    model = get_whisper_model()
    segments, _ = model.transcribe(wav_buffer, language="ja", beam_size=5)
    return "".join(seg.text for seg in segments).strip()


def build_extraction_system_prompt(manuals: list[Manual], deep_dive_level: int = 4) -> str:
    manual_texts = []
    for m in manuals:
        if m.content_text:
            manual_texts.append(f"【{m.file_name}】\n{m.content_text[:3000]}")

    manual_section = "\n\n".join(manual_texts) if manual_texts else "（マニュアルなし）"

    return f"""あなたは業務の暗黙知を引き出す専門的なインタビュアーです。
以下の業務マニュアルを熟読し、その章立て・内容に沿いながら、マニュアルに記載されていない判断基準・経験則・ノウハウを熟練者から引き出してください。

## 業務マニュアル
{manual_section}

## インタビューの進め方
1. マニュアルの第1章から順番に、各章のテーマに沿って質問する
2. 各章について「このステップで、マニュアルに書かれていない判断や工夫はありますか？」と具体的に問いかける
3. 回答があれば「なぜその判断をするのか？」「どんな条件のときにそうするのか？」「他にも似たような場面はありますか？」と角度を変えながら深掘りを続ける
4. 1つのテーマで深掘り質問を**{deep_dive_level}回**行ってから、次の章のテーマへ進む
5. 日本語で会話する

## 回答への対応ルール（厳守）
- 「特にない」「ない」という回答でも、別の角度で1〜2回は再度問いかけてみる（例：「例えば〇〇の場面では？」）
- それでも「ない」と言われたら素直に受け入れ、次の章へ進む
- 同じテーマへの質問は合計{deep_dive_level}回が上限。上限に達したら必ず次のテーマへ進む
- まったく同じ表現で繰り返さず、毎回角度を変えて問いかける

## スコープ維持ルール（絶対厳守）
- 業務マニュアルのインタビュー以外の話題（悩み相談・雑談・業務と無関係な質問）には一切応じない
- 話題が逸れた場合は「少し話が変わりましたが、引き続き〇〇についてお聞きします」と自然に元に戻す
- どんな発言に対しても、インタビュアーとしての立場を維持する

## 最初のターンのルール（厳守）
- 「承知しました」「了解しました」などの確認フレーズは絶対に使わない
- 挨拶・前置き・自己紹介は一切不要
- マニュアルの第1章の具体的な内容に言及しながら、最初の質問を話しかけるように始める
- 例：「まず第1章の〇〇についてですが、実際の現場では△△のとき、マニュアルに書かれていない判断をすることはありますか？」"""


def build_lecture_system_prompt(tacit_knowledge_list: list[TacitKnowledge]) -> str:
    knowledge_texts = []
    for tk in tacit_knowledge_list:
        knowledge_texts.append(
            f"【{tk.business_flow_name}】\n"
            f"判断基準: {tk.judgment_criteria}\n"
            f"適用条件: {tk.applicable_conditions or 'なし'}\n"
            f"備考: {tk.notes or 'なし'}"
        )

    knowledge_section = "\n\n".join(knowledge_texts) if knowledge_texts else "（蓄積された暗黙知なし）"

    return f"""あなたは業務の暗黙知を学習者に教える専門的な講師です。
以下の暗黙知データベースを基に、学習者の質問に答えたり、テストを行ったりしてください。

## 蓄積された暗黙知
{knowledge_section}

## 指示
- 必ず「です・ます調」の丁寧な敬語で話す（タメ口・命令形は絶対に使わない）
- 日本語で会話する
- 具体的な事例を使って説明する
- 学習者が「なぜ？」を理解できるよう丁寧に教える

## 最初のターンのルール（厳守）
- 「承知しました」「了解しました」「はい、わかりました」などの確認フレーズは絶対に使わない
- 挨拶・前置きは短くし、すぐに具体的な内容に入る
- 例：「では、まず〇〇についてお聞きします。△△の場面ではどう対応しますか？」のように始める"""


def structure_tacit_knowledge(dialogue_logs: list[DialogueLog]) -> list[dict]:
    logger.info(f"structure_tacit_knowledge: {len(dialogue_logs)} logs, model={settings.OLLAMA_CHAT_MODEL}")
    client = get_ollama_client()

    conversation = "\n".join(
        [f"{'ボット' if log.speaker == 'bot' else '熟練者'}: {log.text}" for log in dialogue_logs]
    )

    prompt = f"""以下は業務熟練者とインタビューボットの対話記録です。
熟練者の発言はSTT（音声認識）による自動書き起こしのため、業務用語に誤変換が含まれる場合があります。
ボットの発言・質問を文脈として活用し、熟練者の発言の誤変換を補正した上で、暗黙知を詳細に抽出・構造化してください。

## 対話内容
{conversation}

## 出力形式（JSONオブジェクト）
{{
  "items": [
    {{
      "business_flow_name": "業務フロー名（具体的な場面名）",
      "judgment_criteria": "判断基準の内容（具体的かつ詳細に）",
      "applicable_conditions": "この判断が発動する具体的な状況・条件",
      "notes": "例外的な対応・背景にある理由・注意点"
    }}
  ]
}}

## 抽出ルール（厳守）
- 熟練者が対話の中で**実際に発言した内容のみ**を抽出する（推測・一般論の追加禁止）
- STT誤変換はボットの文脈から補正して解釈する
- 対話から読み取れる暗黙知が存在しない場合は items を空配列にする"""

    logger.info("Calling Ollama for tacit knowledge extraction...")
    response = client.chat.completions.create(
        model=settings.OLLAMA_CHAT_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
    )
    logger.info("Ollama extraction completed.")
    raw = (response.choices[0].message.content or "").strip()

    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            items = parsed.get("items", [])
            if isinstance(items, list):
                return items
            for key in parsed:
                if isinstance(parsed[key], list):
                    return parsed[key]
        return parsed if isinstance(parsed, list) else []
    except Exception:
        logger.error(f"JSON parse failed. raw={raw[:200]}")
        return []
