from fastapi import FastAPI

app = FastAPI(title="outreach-agent")


@app.get("/")
def root() -> dict[str, str]:
    return {"service": "outreach-agent", "status": "ok"}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "healthy"}
