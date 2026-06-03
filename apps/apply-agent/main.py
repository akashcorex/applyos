from fastapi import FastAPI

app = FastAPI(title="apply-agent")


@app.get("/")
def root() -> dict[str, str]:
    return {"service": "apply-agent", "status": "ok"}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "healthy"}
