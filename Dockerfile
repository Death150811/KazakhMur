# ВНИМАНИЕ: образ не собирался и не проверялся (в среде разработки не было Docker-демона).
# См. docs/SECURITY.md перед любым публичным размещением.
# Сайт не требует Node.js: scripts/build_site.py собирает одну HTML-страницу.

FROM python:3.13-slim
RUN useradd --create-home --uid 10001 qaz
WORKDIR /app
COPY pyproject.toml README.md ./
COPY qaz/ qaz/
COPY backend/ backend/
COPY examples/ examples/
COPY scripts/ scripts/
COPY site/src/ site/src/
RUN pip install --no-cache-dir ".[science,server]" && python scripts/build_site.py
USER qaz
EXPOSE 8000
CMD ["python", "-m", "uvicorn", "backend.app:app", "--host", "0.0.0.0", "--port", "8000"]
