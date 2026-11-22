# ВНИМАНИЕ: образ не собирался и не проверялся (в среде разработки не было Docker-демона).
# См. docs/SECURITY.md перед любым публичным размещением.

FROM node:22-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
COPY scripts/ /app/scripts/
RUN npm run build

FROM python:3.13-slim
RUN useradd --create-home --uid 10001 qaz
WORKDIR /app
COPY pyproject.toml README.md ./
COPY qaz/ qaz/
COPY backend/ backend/
COPY examples/ examples/
RUN pip install --no-cache-dir ".[science,server]"
COPY --from=frontend /app/frontend/dist frontend/dist
USER qaz
EXPOSE 8000
CMD ["python", "-m", "uvicorn", "backend.app:app", "--host", "0.0.0.0", "--port", "8000"]
