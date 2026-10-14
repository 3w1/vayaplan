FROM oven/bun:1-alpine

WORKDIR /app

# Copiar manifiestos
COPY package.json tsconfig.json ./
COPY apps/web/package.json ./apps/web/

# Instalar dependencias
RUN bun install

# Copiar código fuente
COPY apps/web/ ./apps/web/

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["bun", "run", "apps/web/src/index.ts"]
