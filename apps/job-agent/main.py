from contextlib import asynccontextmanager

from fastapi import FastAPI

from routes.detect import router as detect_router
from routes.funding import router as funding_router
from routes.health import router as health_router
from routes.ingest import router as ingest_router
from routes.search import router as search_router
from routes.semantic import router as semantic_router


@asynccontextmanager
async def lifespan(_app: FastAPI):
    yield


app = FastAPI(title="job-agent", lifespan=lifespan)

app.include_router(health_router)
app.include_router(ingest_router, prefix="/ingest")
app.include_router(funding_router, prefix="/funding")
app.include_router(search_router, prefix="/search")
app.include_router(semantic_router, prefix="/search")
app.include_router(detect_router)
