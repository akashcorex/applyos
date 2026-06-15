from contextlib import asynccontextmanager

from fastapi import FastAPI

from routes.detect import router as detect_router
from routes.health import router as health_router
from routes.ingest import router as ingest_router


@asynccontextmanager
async def lifespan(_app: FastAPI):
    yield


app = FastAPI(title="job-agent", lifespan=lifespan)

app.include_router(health_router)
app.include_router(ingest_router, prefix="/ingest")
app.include_router(detect_router)
