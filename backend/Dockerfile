# --- Builder stage ---
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN npx prisma generate --schema=src/prisma/schema.prisma
RUN npm run build

# --- Production stage ---
FROM node:20-alpine AS production

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder /app/src/prisma ./src/prisma
COPY --from=builder /app/src/scenarios/packs ./src/scenarios/packs

EXPOSE 3001

CMD ["sh", "-c", "npx prisma migrate deploy --schema=src/prisma/schema.prisma && node dist/main"]
