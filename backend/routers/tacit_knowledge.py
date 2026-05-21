from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from database import get_db, TacitKnowledge

router = APIRouter(prefix="/api/tacit-knowledge", tags=["tacit_knowledge"])


class TacitKnowledgeResponse(BaseModel):
    id: int
    business_category_id: int
    session_id: int | None
    business_flow_name: str
    judgment_criteria: str
    applicable_conditions: str | None
    notes: str | None

    class Config:
        from_attributes = True


class TacitKnowledgeUpdate(BaseModel):
    business_flow_name: str | None = None
    judgment_criteria: str | None = None
    applicable_conditions: str | None = None
    notes: str | None = None


@router.get("", response_model=list[TacitKnowledgeResponse])
def list_tacit_knowledge(category_id: int | None = None, db: Session = Depends(get_db)):
    q = db.query(TacitKnowledge)
    if category_id:
        q = q.filter(TacitKnowledge.business_category_id == category_id)
    return q.order_by(TacitKnowledge.created_at.desc()).all()


@router.put("/{knowledge_id}", response_model=TacitKnowledgeResponse)
def update_tacit_knowledge(knowledge_id: int, body: TacitKnowledgeUpdate, db: Session = Depends(get_db)):
    item = db.query(TacitKnowledge).filter(TacitKnowledge.id == knowledge_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="暗黙知が見つかりません")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{knowledge_id}")
def delete_tacit_knowledge(knowledge_id: int, db: Session = Depends(get_db)):
    item = db.query(TacitKnowledge).filter(TacitKnowledge.id == knowledge_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="暗黙知が見つかりません")
    db.delete(item)
    db.commit()
    return {"ok": True}
