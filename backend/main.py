import os

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import init_db
from routers.workouts import router as workouts_router
from routers.garmin import router as garmin_router
from routers.race_bests import router as race_bests_router

app = FastAPI(title="Triathlon Calendar API")

# FRONTEND_URL lets the deployed frontend's real origin be added without a
# code change — set it in the host's env vars once that URL is known. Local
# dev's localhost origin is always allowed alongside it.
allow_origins = ["http://localhost:5173"]
if os.getenv("FRONTEND_URL"):
    allow_origins.append(os.getenv("FRONTEND_URL"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
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
