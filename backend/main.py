from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import init_db
from routers.workouts import router as workouts_router
from routers.garmin import router as garmin_router
from routers.race_bests import router as race_bests_router

app = FastAPI(title="Triathlon Calendar API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    init_db()


app.include_router(workouts_router)
app.include_router(garmin_router)
app.include_router(race_bests_router)


@app.get("/health")
def health():
    return {"status": "ok"}
