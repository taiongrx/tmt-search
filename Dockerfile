# syntax=docker/dockerfile:1
FROM python:3.11-slim

WORKDIR /app

# ติดตั้ง dependencies
COPY api/requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt gunicorn

# คัดลอกฐานข้อมูลและโค้ด API
COPY db/ /app/db/
COPY api/ /app/api/

ENV PORT=5050
ENV PYTHONUNBUFFERED=1

EXPOSE 5050

# รันด้วย gunicorn แบบ production-ready
CMD ["gunicorn", "--bind", "0.0.0.0:5050", "--workers", "2", "--timeout", "120", "--chdir", "/app/api", "tmt_to_atc_api:app"]
