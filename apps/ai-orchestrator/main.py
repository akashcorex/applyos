from fastapi import FastAPI

app = FastAPI(title="ai-orchestrator")


@app.get("/")
def root() -> dict[str, str]:
    return {"service": "ai-orchestrator", "status": "ok"}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "healthy"}
