import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import Base, engine

import auth
import connections
import monitoring
import alerts
import medications
import respiratory_events


# =========================================================
# DATABASE
# =========================================================

Base.metadata.create_all(
    bind=engine
)


# =========================================================
# APPLICATION
# =========================================================

app = FastAPI(
    title="RespiCare API",
    description=(
        "Backend API for RespiCare respiratory monitoring, "
        "caregiver connectivity, clinical alerts, "
        "medication management, and respiratory event history."
    ),
    version="2.0.0",
)


# =========================================================
# CORS
# =========================================================

frontend_url = os.getenv(
    "FRONTEND_URL",
    "https://respicare-web.onrender.com",
)


origins = [
    # Local development
    "http://localhost:5173",
    "http://127.0.0.1:5173",

    # Production frontend
    "https://respicare-web.onrender.com",
]


# Also allow the frontend URL configured in Render
if frontend_url and frontend_url not in origins:
    origins.append(frontend_url)


app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================================================
# ROUTERS
# =========================================================

app.include_router(auth.router)
app.include_router(connections.router)
app.include_router(monitoring.router)
app.include_router(alerts.router)
app.include_router(medications.router)
app.include_router(respiratory_events.router)


# =========================================================
# ROOT
# =========================================================

@app.get("/")
def root():
    return {
        "application": "RespiCare",
        "status": "running",
        "version": "2.0.0",
    }


# =========================================================
# HEALTH
# =========================================================

@app.get("/health")
def health():
    return {
        "status": "healthy",
        "service": "RespiCare API",
    }