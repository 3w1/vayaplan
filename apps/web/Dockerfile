FROM oven/bun:1-alpine

WORKDIR /app

# Copiar manifiestos del monorepo
COPY package.json tsconfig.json ./
COPY packages/types/package.json ./packages/types/
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/

# Instalar dependencias
RUN bun install

# Copiar código fuente
COPY packages/types/ ./packages/types/
COPY packages/shared/ ./packages/shared/
COPY apps/web/ ./apps/web/

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["bun", "run", "apps/web/src/index.ts"]
