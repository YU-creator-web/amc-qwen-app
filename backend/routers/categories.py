from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from database import get_db, BusinessCategory

router = APIRouter(prefix="/api/categories", tags=["categories"])


class CategoryCreate(BaseModel):
    name: str


class CategoryResponse(BaseModel):
    id: int
    name: str

    class Config:
        from_attributes = True


@router.get("", response_model=list[CategoryResponse])
def list_categories(db: Session = Depends(get_db)):
    return db.query(BusinessCategory).order_by(BusinessCategory.id).all()


@router.post("", response_model=CategoryResponse)
def create_category(body: CategoryCreate, db: Session = Depends(get_db)):
    existing = db.query(BusinessCategory).filter(BusinessCategory.name == body.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="既に同じ名前の業務区分が存在します")
    cat = BusinessCategory(name=body.name)
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


@router.delete("/{category_id}")
def delete_category(category_id: int, db: Session = Depends(get_db)):
    cat = db.query(BusinessCategory).filter(BusinessCategory.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="業務区分が見つかりません")
    db.delete(cat)
    db.commit()
    return {"ok": True}
