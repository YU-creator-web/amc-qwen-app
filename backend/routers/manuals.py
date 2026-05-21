import io
import os
import aiofiles
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from pydantic import BaseModel
from database import get_db, Manual, BusinessCategory, settings


def extract_text(content: bytes, ext: str) -> str | None:
    try:
        if ext == ".txt":
            return content.decode("utf-8", errors="ignore")
        if ext == ".pdf":
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(content))
            return "\n".join(page.extract_text() or "" for page in reader.pages)
        if ext == ".docx":
            from docx import Document
            doc = Document(io.BytesIO(content))
            return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
    except Exception:
        pass
    return None

router = APIRouter(prefix="/api/manuals", tags=["manuals"])

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt"}


class ManualResponse(BaseModel):
    id: int
    business_category_id: int
    file_name: str

    class Config:
        from_attributes = True


@router.get("", response_model=list[ManualResponse])
def list_manuals(category_id: int, db: Session = Depends(get_db)):
    return db.query(Manual).filter(Manual.business_category_id == category_id).all()


@router.post("", response_model=ManualResponse)
async def upload_manual(
    category_id: int = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    cat = db.query(BusinessCategory).filter(BusinessCategory.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="業務区分が見つかりません")

    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="PDF・DOCX・TXT のみアップロード可能です")

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    save_path = os.path.join(settings.UPLOAD_DIR, f"{category_id}_{file.filename}")
    async with aiofiles.open(save_path, "wb") as f:
        content = await file.read()
        await f.write(content)

    content_text = extract_text(content, ext)

    manual = Manual(
        business_category_id=category_id,
        file_name=file.filename,
        file_path=save_path,
        content_text=content_text,
    )
    db.add(manual)
    db.commit()
    db.refresh(manual)
    return manual


@router.delete("/{manual_id}")
def delete_manual(manual_id: int, db: Session = Depends(get_db)):
    manual = db.query(Manual).filter(Manual.id == manual_id).first()
    if not manual:
        raise HTTPException(status_code=404, detail="マニュアルが見つかりません")
    if os.path.exists(manual.file_path):
        os.remove(manual.file_path)
    db.delete(manual)
    db.commit()
    return {"ok": True}
