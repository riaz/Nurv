FROM python:3.11-slim

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

# Copy pyproject.toml
COPY pyproject.toml ./

# Sync dependencies (creates .venv)
RUN uv sync

# Copy source code
COPY . .

# Run the application using uv run
CMD ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
