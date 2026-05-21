import asyncio
import json
import logging
import websockets
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from sqlalchemy.orm import Session as DBSession
from database import get_db, Session, DialogueLog, Manual, TacitKnowledge, Speaker, settings
from services.ai_service import build_extraction_system_prompt, build_lecture_system_prompt, structure_tacit_knowledge

logger = logging.getLogger(__name__)
router = APIRouter(tags=["voice"])

def get_azure_ws_url() -> str:
    base = settings.AZURE_OPENAI_ENDPOINT.replace("https://", "").rstrip("/")
    return (
        f"wss://{base}/openai/realtime"
        f"?api-version={settings.AZURE_OPENAI_API_VERSION}"
        f"&deployment={settings.AZURE_OPENAI_REALTIME_DEPLOYMENT}"
    )


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


@router.websocket("/ws/voice/{session_id}")
async def voice_websocket(websocket: WebSocket, session_id: int, db: DBSession = Depends(get_db)):
    await websocket.accept()

    session = db.query(Session).filter(Session.id == session_id).first()
    if not session:
        await websocket.close(code=4004)
        return

    system_prompt = await get_system_prompt_for_session(session_id, db)

    azure_url = get_azure_ws_url()
    logger.info(f"Azure WS URL: {azure_url}")
    try:
        extra_headers = {"api-key": settings.REALTIME_KEY}
        async with websockets.connect(azure_url, additional_headers=extra_headers) as azure_ws:
            # セッション初期化
            await azure_ws.send(json.dumps({
                "type": "session.update",
                "session": {
                    "modalities": ["text", "audio"],
                    "instructions": system_prompt,
                    "voice": "alloy",
                    "input_audio_format": "pcm16",
                    "output_audio_format": "pcm16",
                    "input_audio_transcription": {
                        "model": "gpt-4o-mini-transcribe",
                        "language": "ja",
                        "prompt": "口座開設、本人確認、免許証、健康保険証、住民票、マイナンバー、申込書、代理人、訂正印、有効期限、反社チェック",
                    },
                    "turn_detection": None,
                    "temperature": 0.7,
                }
            }))

            async def browser_to_azure():
                try:
                    while True:
                        data = await websocket.receive_text()
                        msg = json.loads(data)
                        await azure_ws.send(json.dumps(msg))
                except (WebSocketDisconnect, Exception):
                    pass

            async def azure_to_browser():
                session_initialized = False
                last_bot_text = ""
                try:
                    async for raw in azure_ws:
                        msg = json.loads(raw)
                        msg_type = msg.get("type", "")

                        await websocket.send_text(json.dumps(msg))

                        # セッション確立後、2秒待ってからボットの最初の質問を開始
                        if not session_initialized and msg_type == "session.updated":
                            session_initialized = True
                            await asyncio.sleep(1)
                            await azure_ws.send(json.dumps({"type": "response.create"}))

                        # ボット発話確定 → DB保存 & 文脈として保持
                        if msg_type == "response.audio_transcript.done":
                            text = msg.get("transcript", "").strip()
                            if text:
                                last_bot_text = text
                                log = DialogueLog(session_id=session_id, speaker=Speaker.bot, text=text)
                                db.add(log)
                                db.commit()

                        # ユーザー発話確定 → 生STTをDB保存 & 「送信済」通知のみ送信
                        elif msg_type == "conversation.item.input_audio_transcription.completed":
                            raw_text = msg.get("transcript", "").strip()
                            if raw_text:
                                log = DialogueLog(session_id=session_id, speaker=Speaker.user, text=raw_text)
                                db.add(log)
                                db.commit()
                                await websocket.send_text(json.dumps({
                                    "type": "user_transcript_saved",
                                }))

                except Exception:
                    pass

            await asyncio.gather(browser_to_azure(), azure_to_browser())

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"Voice WebSocket error: {type(e).__name__}: {e}")
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
