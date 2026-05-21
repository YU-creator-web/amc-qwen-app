import asyncio
import json
import logging
import traceback
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from sqlalchemy.orm import Session as DBSession
from database import get_db, Session, DialogueLog, Manual, TacitKnowledge, Speaker, settings
from services.ai_service import (
    build_extraction_system_prompt,
    build_lecture_system_prompt,
    structure_tacit_knowledge,
    transcribe_audio,
    get_ollama_client,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["voice"])


async def get_system_prompt_for_session(session_id: int, db: DBSession) -> str:
    session = db.query(Session).filter(Session.id == session_id).first()
    if not session:
        return "日本語で会話してください。"

    if session.mode.value == "extraction":
        manuals = db.query(Manual).filter(Manual.business_category_id == session.business_category_id).all()
        return build_extraction_system_prompt(manuals, session.deep_dive_level)
    else:
        tacit_list = db.query(TacitKnowledge).filter(
            TacitKnowledge.business_category_id == session.business_category_id
        ).all()
        return build_lecture_system_prompt(tacit_list)


async def call_ollama(messages: list, websocket: WebSocket) -> str:
    client = get_ollama_client()

    def _call():
        response = client.chat.completions.create(
            model=settings.OLLAMA_CHAT_MODEL,
            messages=messages,
            stream=False,
            temperature=0.7,
        )
        return response.choices[0].message.content or ""

    await websocket.send_text(json.dumps({"type": "bot_thinking"}))
    try:
        full_text = await asyncio.to_thread(_call)
    except Exception as e:
        logger.error(f"Ollama error: {e}")
        full_text = ""

    await websocket.send_text(json.dumps({
        "type": "bot_done",
        "text": full_text,
    }))
    return full_text


@router.websocket("/ws/voice/{session_id}")
async def voice_websocket(websocket: WebSocket, session_id: int, db: DBSession = Depends(get_db)):
    await websocket.accept()

    session = db.query(Session).filter(Session.id == session_id).first()
    if not session:
        await websocket.close(code=4004)
        return

    system_prompt = await get_system_prompt_for_session(session_id, db)
    messages = [{"role": "system", "content": system_prompt}]

    try:
        # 最初のボットの質問を生成して送信
        first_text = await call_ollama(messages, websocket)
        if first_text:
            messages.append({"role": "assistant", "content": first_text})
            db.add(DialogueLog(session_id=session_id, speaker=Speaker.bot, text=first_text))
            db.commit()

        # メインループ：ユーザーの音声を受け取って応答
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)

            if msg.get("type") == "audio_data":
                pcm16_base64 = msg.get("audio", "")
                sample_rate = msg.get("sample_rate", 24000)

                # STT
                await websocket.send_text(json.dumps({"type": "transcribing"}))
                transcript = await asyncio.to_thread(transcribe_audio, pcm16_base64, sample_rate)

                if not transcript:
                    await websocket.send_text(json.dumps({
                        "type": "transcript",
                        "text": "",
                        "error": "音声を認識できませんでした。もう一度話しかけてください。",
                    }))
                    continue

                await websocket.send_text(json.dumps({
                    "type": "transcript",
                    "text": transcript,
                }))
                db.add(DialogueLog(session_id=session_id, speaker=Speaker.user, text=transcript))
                db.commit()

                # LLM応答
                messages.append({"role": "user", "content": transcript})
                bot_text = await call_ollama(messages, websocket)
                if bot_text:
                    messages.append({"role": "assistant", "content": bot_text})
                    db.add(DialogueLog(session_id=session_id, speaker=Speaker.bot, text=bot_text))
                    db.commit()

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"Voice WebSocket error: {type(e).__name__}: {e}")
        logger.error(traceback.format_exc())
        try:
            await websocket.send_text(json.dumps({"type": "error", "message": str(e)}))
            await websocket.close()
        except Exception:
            pass


@router.post("/api/sessions/{session_id}/structure")
async def structure_session(session_id: int, db: DBSession = Depends(get_db)):
    session = db.query(Session).filter(Session.id == session_id).first()
    if not session:
        return {"error": "セッションが見つかりません"}

    logs = db.query(DialogueLog).filter(DialogueLog.session_id == session_id).order_by(DialogueLog.timestamp).all()
    if not logs:
        return {"structured": []}

    try:
        structured = await asyncio.to_thread(structure_tacit_knowledge, logs)
    except Exception as e:
        logger.error(f"structure_tacit_knowledge failed: {type(e).__name__}: {e}")
        return {"error": str(e), "structured": []}

    saved = []
    for item in structured:
        tk = TacitKnowledge(
            business_category_id=session.business_category_id,
            session_id=session_id,
            business_flow_name=item.get("business_flow_name", "未分類"),
            judgment_criteria=item.get("judgment_criteria", ""),
            applicable_conditions=item.get("applicable_conditions"),
            notes=item.get("notes"),
        )
        db.add(tk)
        saved.append(item)

    db.commit()
    return {"structured": saved}
