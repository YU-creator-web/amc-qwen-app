import logging
logging.basicConfig(level=logging.INFO)
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from database import create_tables, SessionLocal, BusinessCategory
from routers import categories, manuals, sessions, tacit_knowledge, voice

app = FastAPI(title="ナレッジ管理システム API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logging.error(f"Unhandled exception: {type(exc).__name__}: {exc}")
    return JSONResponse(
        status_code=500,
        content={"error": str(exc)},
        headers={"Access-Control-Allow-Origin": "http://localhost:3000"},
    )

app.include_router(categories.router)
app.include_router(manuals.router)
app.include_router(sessions.router)
app.include_router(tacit_knowledge.router)
app.include_router(voice.router)


@app.on_event("startup")
def startup():
    create_tables()
    seed_initial_data()


def seed_initial_data():
    db = SessionLocal()
    try:
        if not db.query(BusinessCategory).first():
            db.add(BusinessCategory(name="口座開設"))
            db.commit()
    finally:
        db.close()


@app.get("/health")
def health():
    return {"status": "ok"}
