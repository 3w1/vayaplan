# VayaPlan — Arquitectura Técnica y Despliegue

**Versión:** 1.1  
**Fecha:** 14 de octubre de 2026  
**Piloto:** Palencia  
**Cambio clave:** Nginx del host como proxy inverso y gestor SSL; Caddy eliminado del despliegue Docker.

---

## 1. Principios

1. Simplicidad antes que optimización prematura.
2. Un solo servidor VPS para el piloto.
3. Multi-ciudad desde el modelo de datos.
4. Infraestructura reproducible con Docker Compose.
5. Nginx ya existente en el host gestiona SSL y proxy inverso.
6. Los contenedores solo exponen puertos en `127.0.0.1`.
7. Copias de seguridad automáticas.
8. Observabilidad mínima desde el primer día.
9. Coste objetivo inferior a 20 € mensuales.

---

## 2. Stack tecnológico

| Capa | Tecnología | Motivo |
|---|---|---|
| Frontend | Astro o Next.js | PWA rápida, SEO y renderizado eficiente |
| Estilos | Tailwind CSS | Desarrollo rápido y consistente |
| API | Bun + Hono | Ligero, rápido y sencillo |
| Base de datos | PostgreSQL 16 | Relacional, fiable y escalable |
| Almacenamiento | Cloudflare R2 | Compatible con S3 y sin coste de salida |
| Proxy inverso | Nginx en el host | Ya existe en el VPS y gestiona otras aplicaciones |
| SSL | Certbot / Let's Encrypt | Certificados automáticos en Nginx |
| Contenedores | Docker Compose | Reproducibilidad |
| Servidor | VPS Ubuntu 24.04 LTS | Coste bajo y control total |
| Analítica | Eventos propios + analítica web | Medición de producto y campañas |

---

## 3. Arquitectura lógica

```text
Internet
   │
   ▼
Cloudflare DNS (nube gris)
   │
   ▼
Nginx en el host VPS
   ├── SSL con Certbot / Let's Encrypt
   ├── /api/* → 127.0.0.1:4000
   └── /      → 127.0.0.1:3030
           │
           ├── Contenedor web: 127.0.0.1:3030 → 3000
           └── Contenedor API: 127.0.0.1:4000 → 4000
                   │
                   ▼
              PostgreSQL 16
                   │
                   ├── Workers
                   │    ├── Ingesta WhatsApp
                   │    ├── Procesado de imágenes
                   │    ├── Caducidad de eventos
                   │    └── Informes de campañas
                   │
                   └── Cloudflare R2
                        └── Imágenes optimizadas
```

**Regla importante:** Caddy no debe ejecutarse dentro de Docker. Nginx ya ocupa los puertos 80 y 443 en el host.

---

## 4. Estructura recomendada del monorepo

```text
vayaplan/
  apps/
    web/
    api/
    admin/
  packages/
    shared/
    types/
    db/
  infra/
    docker-compose.yml
    nginx/vayaplan.com.conf
    .env.example
  docs/
    01-prd.md
    02-data-model.md
    03-ingestion-runbook.md
    04-architecture.md
    05-sprint-backlog.md
    06-gtm-playbook.md
  ops/
    palencia-venues.csv
    palencia-events.csv
```

---

## 5. Variables de entorno

```env
NODE_ENV=production
APP_URL=https://vayaplan.com
API_URL=https://vayaplan.com/api

POSTGRES_USER=vayaplan_user
POSTGRES_PASSWORD=cambia-esta-clave
DATABASE_URL=postgresql://vayaplan_user:cambia-esta-clave@db:5432/vayaplan

R2_ACCOUNT_ID=xxx
R2_ACCESS_KEY_ID=xxx
R2_SECRET_ACCESS_KEY=xxx
R2_BUCKET=vayaplan-media
R2_PUBLIC_URL=https://media.vayaplan.com

WHATSAPP_BUSINESS_NUMBER=+34XXXXXXXXX
WHATSAPP_WEBHOOK_SECRET=xxx

ANALYTICS_WRITE_KEY=xxx

ADMIN_EMAIL=admin@vayaplan.com
ADMIN_PASSWORD_HASH=xxx
JWT_SECRET=xxx
```

Nunca subir `.env` al repositorio.

---

## 6. Docker Compose

Este compose **no incluye Caddy**. Nginx del host actúa como proxy inverso y gestor SSL.

```yaml
version: '3.8'

services:
  db:
    image: postgres:16-alpine
    container_name: vayaplan_postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: vayaplan
      POSTGRES_USER: ${POSTGRES_USER:-vayaplan_user}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - vayaplan_db_data:/var/lib/postgresql/data
    networks:
      - vayaplan_net

  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    container_name: vayaplan_api
    restart: unless-stopped
    ports:
      - "127.0.0.1:4000:4000"
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://${POSTGRES_USER:-vayaplan_user}:${POSTGRES_PASSWORD}@db:5432/vayaplan
    depends_on:
      - db
    networks:
      - vayaplan_net

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    container_name: vayaplan_web
    restart: unless-stopped
    ports:
      - "127.0.0.1:3030:3000"
    environment:
      NODE_ENV: production
      API_URL: https://vayaplan.com/api
    depends_on:
      - api
    networks:
      - vayaplan_net

volumes:
  vayaplan_db_data:

networks:
  vayaplan_net:
    driver: bridge
```

---

## 7. Configuración de Nginx

Crear `/etc/nginx/sites-available/vayaplan.com.conf`:

```nginx
server {
    listen 80;
    server_name vayaplan.com www.vayaplan.com;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name vayaplan.com www.vayaplan.com;

    ssl_certificate /etc/letsencrypt/live/vayaplan.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/vayaplan.com/privkey.pem;

    client_max_body_size 20M;

    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:3030;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### Activar configuración

```bash
sudo ln -s /etc/nginx/sites-available/vayaplan.com.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### Emitir certificado

```bash
sudo certbot --nginx -d vayaplan.com -d www.vayaplan.com
```

---

## 8. DNS en Cloudflare

Configuración recomendada para el piloto:

| Registro | Nombre | Destino | Proxy |
|---|---|---|---|
| A | `@` | IP pública del VPS | Nube gris |
| CNAME | `www` | `vayaplan.com` | Nube gris |

La nube gris permite que Certbot valide el dominio directamente contra el VPS. Cloudflare proxy puede activarse más adelante, pero no es necesario para el MVP.

---

## 9. Imágenes y multimedia

### Reglas

- Nunca guardar URLs temporales de terceros como imagen definitiva.
- Descargar la imagen en el momento de ingesta.
- Convertir a WebP o AVIF.
- Redimensionar a un máximo razonable para móvil.
- Subir a Cloudflare R2.
- Guardar la URL definitiva en PostgreSQL.

### Tamaños recomendados

| Uso | Ancho máximo | Formato |
|---|---:|---|
| Tarjeta de evento | 800 px | WebP |
| Tarjeta destacada | 1200 px | WebP |
| Open Graph | 1200 × 630 px | JPEG o WebP |

---

## 10. API

### Endpoints públicos

```http
GET /api/v1/cities/:citySlug/events
GET /api/v1/cities/:citySlug/weekend
GET /api/v1/cities/:citySlug/places
GET /api/v1/events/:id
POST /api/v1/metrics
```

### Endpoints administrativos

```http
POST /api/v1/admin/login
GET  /api/v1/admin/events
POST /api/v1/admin/events
PATCH /api/v1/admin/events/:id
DELETE /api/v1/admin/events/:id
POST /api/v1/admin/events/draft
POST /api/v1/admin/promotions
GET  /api/v1/admin/promotions/:id/report
```

---

## 11. Seguridad

- HTTPS obligatorio.
- Nginx como único punto de entrada público.
- Contenedores expuestos solo en `127.0.0.1`.
- Cabeceras de seguridad básicas.
- Rate limiting en endpoints públicos.
- Autenticación para panel administrativo.
- Validación estricta de payloads.
- Secrets fuera del repositorio.
- Backups cifrados o almacenados en ubicación privada.
- Acceso SSH mediante clave, no contraseña.

---

## 12. Backups

### Política mínima

- `pg_dump` diario.
- Retención de 7 copias diarias.
- Retención de 4 copias semanales.
- Almacenamiento externo al VPS.
- Prueba de restauración mensual.

### Comando base

```bash
docker exec vayaplan_postgres pg_dump \
  -U "${POSTGRES_USER:-vayaplan_user}" \
  -d vayaplan \
  --format=custom \
  > /backups/vayaplan-$(date +%F).dump
```

---

## 13. Observabilidad

### Mínimo viable

- Logs estructurados.
- Monitorización de errores.
- Uptime check de la home y la API.
- Alerta si la web o la API no responden.
- Métricas de rendimiento web.

### Endpoints de salud

```http
GET /api/health
GET /api/health/db
```

### Eventos críticos

- Error al crear evento.
- Error al subir imagen.
- Error de base de datos.
- Web caída.
- API caída.
- Fallo de backup.

---

## 14. Criterios de aceptación técnicos

- Nginx responde en los puertos 80 y 443 del host.
- Caddy no está presente en `docker-compose.yml`.
- La API solo es accesible desde `127.0.0.1:4000`.
- La web solo es accesible desde `127.0.0.1:3030`.
- `https://vayaplan.com/api/health` responde correctamente.
- `https://vayaplan.com` carga la PWA.
- Los certificados SSL se renuevan automáticamente con Certbot.
- Los backups se generan diariamente.
- El panel permite crear, editar, publicar y cancelar eventos.
- Las métricas se registran correctamente.
