from fastapi import FastAPI

app = FastAPI(title="job-agent")


@app.get("/")
def root() -> dict[str, str]:
    return {"service": "job-agent", "status": "ok"}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "healthy"}
