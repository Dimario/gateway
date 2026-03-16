# Stage 1: install dependencies
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# Stage 2: distroless runtime (no shell, no package manager = minimal CVE surface)
FROM gcr.io/distroless/nodejs20-debian12
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY src ./src
COPY swagger.yaml ./swagger.yaml

EXPOSE 3000

CMD ["src/index.js"]
