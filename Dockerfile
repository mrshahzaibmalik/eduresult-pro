# ─────────────────────────────────────────────────────────
#  EduResult Pro — Dockerfile
#  Multi-stage: build → slim production image
# ─────────────────────────────────────────────────────────
FROM node:20-alpine AS base
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Install dependencies
COPY backend/package.json ./backend/
RUN cd backend && npm install --omit=dev

# Copy source
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# Create data directory
RUN mkdir -p ./backend/data

# ─────────────────────────────────────────────────────────
EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/app/backend/data/eduresult.db

WORKDIR /app/backend

CMD ["node", "server.js"]
