FROM oven/bun:1-alpine

WORKDIR /app

# Copiar manifiestos del monorepo
COPY package.json tsconfig.json ./
COPY packages/types/package.json ./packages/types/
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

# Instalar dependencias
RUN bun install

# Copiar código fuente
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/

ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

CMD ["bun", "run", "apps/api/src/index.ts"]
