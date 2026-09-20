from contextlib import asynccontextmanager

import asyncio

from fastapi import FastAPI

from config import settings
from logging_filters import install_health_access_filter
from routes.detect import router as detect_router
from routes.registry import router as registry_router
from routes.funding import router as funding_router
from routes.health import router as health_router
from routes.ingest import router as ingest_router
from routes.scrape import router as scrape_router
from routes.search import router as search_router
from routes.semantic import router as semantic_router
from services.board_registry import get_board_registry

install_health_access_filter()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    get_board_registry().init_db()
    refresher: asyncio.Task | None = None
    if settings.refresh_enabled:
        from services.refresh import refresh_loop

        refresher = asyncio.create_task(refresh_loop())
    yield
    if refresher is not None:
        refresher.cancel()


app = FastAPI(title="job-agent", lifespan=lifespan)

app.include_router(health_router)
app.include_router(ingest_router, prefix="/ingest")
app.include_router(funding_router, prefix="/funding")
app.include_router(search_router, prefix="/search")
app.include_router(semantic_router, prefix="/search")
app.include_router(scrape_router, prefix="/scrape")
app.include_router(detect_router)
app.include_router(registry_router, prefix="/registry")
