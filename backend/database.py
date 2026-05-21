from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime, ForeignKey, Enum
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from sqlalchemy.sql import func
from pydantic_settings import BaseSettings
import enum


class Settings(BaseSettings):
    OLLAMA_BASE_URL: str = "http://localhost:11434/v1"
    OLLAMA_CHAT_MODEL: str = "qwen2.5:3b"
    WHISPER_MODEL: str = "tiny"
    WHISPER_DEVICE: str = "cpu"
    DB_PATH: str = "anmokuchi.db"
    UPLOAD_DIR: str = "uploads"

    class Config:
        env_file = ".env"


settings = Settings()

DATABASE_URL = f"sqlite:///{settings.DB_PATH}"

engine = create_engine(DATABASE_URL, echo=False, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class SessionMode(str, enum.Enum):
    extraction = "extraction"
    lecture_test = "lecture_test"
    lecture_dialogue = "lecture_dialogue"


class Speaker(str, enum.Enum):
    bot = "bot"
    user = "user"


# --- Models ---

class BusinessCategory(Base):
    __tablename__ = "business_categories"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, unique=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    manuals = relationship("Manual", back_populates="category", cascade="all, delete-orphan")
    sessions = relationship("Session", back_populates="category")
    tacit_knowledge = relationship("TacitKnowledge", back_populates="category")


class Manual(Base):
    __tablename__ = "manuals"
    id = Column(Integer, primary_key=True, index=True)
    business_category_id = Column(Integer, ForeignKey("business_categories.id"), nullable=False)
    file_name = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False)
    content_text = Column(Text, nullable=True)
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now())
    category = relationship("BusinessCategory", back_populates="manuals")


class Session(Base):
    __tablename__ = "sessions"
    id = Column(Integer, primary_key=True, index=True)
    business_category_id = Column(Integer, ForeignKey("business_categories.id"), nullable=False)
    speaker_name = Column(String(100), nullable=False)
    mode = Column(Enum(SessionMode), nullable=False, default=SessionMode.extraction)
    deep_dive_level = Column(Integer, nullable=False, default=4)
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    ended_at = Column(DateTime(timezone=True), nullable=True)
    category = relationship("BusinessCategory", back_populates="sessions")
    dialogue_logs = relationship("DialogueLog", back_populates="session", cascade="all, delete-orphan")
    tacit_knowledge = relationship("TacitKnowledge", back_populates="session")


class DialogueLog(Base):
    __tablename__ = "dialogue_logs"
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=False)
    speaker = Column(Enum(Speaker), nullable=False)
    text = Column(Text, nullable=False)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    session = relationship("Session", back_populates="dialogue_logs")


class TacitKnowledge(Base):
    __tablename__ = "tacit_knowledge"
    id = Column(Integer, primary_key=True, index=True)
    business_category_id = Column(Integer, ForeignKey("business_categories.id"), nullable=False)
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=True)
    business_flow_name = Column(String(200), nullable=False)
    judgment_criteria = Column(Text, nullable=False)
    applicable_conditions = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    category = relationship("BusinessCategory", back_populates="tacit_knowledge")
    session = relationship("Session", back_populates="tacit_knowledge")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_tables():
    Base.metadata.create_all(bind=engine)
    # SQLite用: 既存テーブルへのカラム追加マイグレーション
    with engine.connect() as conn:
        from sqlalchemy import text, inspect
        inspector = inspect(engine)
        cols = [c["name"] for c in inspector.get_columns("sessions")]
        if "deep_dive_level" not in cols:
            conn.execute(text("ALTER TABLE sessions ADD COLUMN deep_dive_level INTEGER NOT NULL DEFAULT 4"))
            conn.commit()
