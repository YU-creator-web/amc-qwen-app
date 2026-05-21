from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DBSession
from pydantic import BaseModel
from database import get_db, Session, DialogueLog, BusinessCategory, SessionMode, Speaker

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


class SessionCreate(BaseModel):
    business_category_id: int
    speaker_name: str
    mode: SessionMode = SessionMode.extraction
    deep_dive_level: int = 4


class SessionResponse(BaseModel):
    id: int
    business_category_id: int
    speaker_name: str
    mode: str
    deep_dive_level: int
    started_at: datetime
    ended_at: datetime | None

    class Config:
        from_attributes = True


class DialogueLogResponse(BaseModel):
    id: int
    speaker: str
    text: str
    timestamp: datetime

    class Config:
        from_attributes = True


@router.get("", response_model=list[SessionResponse])
def list_sessions(category_id: int | None = None, db: DBSession = Depends(get_db)):
    q = db.query(Session)
    if category_id:
        q = q.filter(Session.business_category_id == category_id)
    return q.order_by(Session.started_at.desc()).all()


@router.post("", response_model=SessionResponse)
def create_session(body: SessionCreate, db: DBSession = Depends(get_db)):
    cat = db.query(BusinessCategory).filter(BusinessCategory.id == body.business_category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="業務区分が見つかりません")
    session = Session(
        business_category_id=body.business_category_id,
        speaker_name=body.speaker_name,
        mode=body.mode,
        deep_dive_level=max(2, min(6, body.deep_dive_level)),
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@router.post("/{session_id}/end")
def end_session(session_id: int, db: DBSession = Depends(get_db)):
    session = db.query(Session).filter(Session.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="セッションが見つかりません")
    session.ended_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True, "session_id": session_id}


@router.delete("/{session_id}")
def delete_session(session_id: int, db: DBSession = Depends(get_db)):
    session = db.query(Session).filter(Session.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="セッションが見つかりません")
    db.delete(session)
    db.commit()
    return {"ok": True}


@router.get("/{session_id}/logs", response_model=list[DialogueLogResponse])
def get_dialogue_logs(session_id: int, db: DBSession = Depends(get_db)):
    session = db.query(Session).filter(Session.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="セッションが見つかりません")
    return db.query(DialogueLog).filter(DialogueLog.session_id == session_id).order_by(DialogueLog.timestamp).all()
