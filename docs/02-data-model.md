# VayaPlan — Modelo de Datos y Contratos de API

**Versión:** 1.1  
**Base de datos:** PostgreSQL 16  
**Zona horaria:** `Europe/Madrid`  
**Fecha:** 14 de octubre de 2026  
**Estado:** Aprobado para desarrollo

---

## 1. Principios

1. Multi-ciudad desde el diseño, aunque el piloto sea Palencia.
2. Fechas reales en `TIMESTAMPTZ`.
3. Fecha editorial independiente para agrupar madrugadas.
4. Estados explícitos de fiabilidad.
5. Promociones separadas de eventos.
6. Métricas registradas desde el primer día.
7. Deduplicación basada en señales compuestas, no en un margen horario único.
8. Las reglas críticas de negocio se protegen también a nivel de base de datos.

---

## 2. Diagrama lógico

```text
cities 1──N venues
cities 1──N events
cities 1──N recurrences
cities 1──N places
cities 1──N promotions
cities 1──N qr_sources

venues 1──N events
venues 1──N recurrences
venues 1──N places
venues 1──N promotions

events 1──N promotions
events 1──N event_metrics
promotions 1──N event_metrics

recurrences 1──N recurrence_exceptions
```

---

## 3. Script DDL

```sql
CREATE TABLE cities (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    timezone VARCHAR(50) NOT NULL DEFAULT 'Europe/Madrid',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE venues (
    id SERIAL PRIMARY KEY,
    city_id INT NOT NULL REFERENCES cities(id) ON DELETE RESTRICT,
    name VARCHAR(150) NOT NULL,
    slug VARCHAR(150) NOT NULL,
    address VARCHAR(255),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    google_maps_url TEXT,
    instagram_handle VARCHAR(100),
    whatsapp_contact VARCHAR(30),
    website_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (city_id, slug)
);

CREATE TABLE events (
    id SERIAL PRIMARY KEY,
    city_id INT NOT NULL REFERENCES cities(id) ON DELETE RESTRICT,
    venue_id INT NOT NULL REFERENCES venues(id) ON DELETE RESTRICT,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ,
    editorial_date DATE NOT NULL,
    price_cents INT NOT NULL DEFAULT 0,
    is_free BOOLEAN NOT NULL DEFAULT true,
    image_url TEXT,
    source_type VARCHAR(30) NOT NULL,
    source_url TEXT,
    source_hash VARCHAR(128),
    dedupe_key VARCHAR(200),
    status VARCHAR(20) NOT NULL DEFAULT 'tentative',
    verified_at TIMESTAMPTZ,
    verified_by VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_events_lookup
ON events (city_id, editorial_date, status, start_time);

CREATE INDEX idx_events_dedupe
ON events (city_id, venue_id, editorial_date, dedupe_key);

CREATE TABLE recurrences (
    id SERIAL PRIMARY KEY,
    city_id INT NOT NULL REFERENCES cities(id) ON DELETE RESTRICT,
    venue_id INT NOT NULL REFERENCES venues(id) ON DELETE RESTRICT,
    day_of_week INT NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME,
    price_cents INT NOT NULL DEFAULT 0,
    is_free BOOLEAN NOT NULL DEFAULT true,
    requires_booking BOOLEAN NOT NULL DEFAULT false,
    booking_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE recurrence_exceptions (
    id SERIAL PRIMARY KEY,
    recurrence_id INT NOT NULL REFERENCES recurrences(id) ON DELETE CASCADE,
    exception_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL,
    modified_start_time TIME,
    modified_end_time TIME,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (recurrence_id, exception_date)
);

CREATE TABLE places (
    id SERIAL PRIMARY KEY,
    city_id INT NOT NULL REFERENCES cities(id) ON DELETE RESTRICT,
    venue_id INT REFERENCES venues(id) ON DELETE SET NULL,
    name VARCHAR(150) NOT NULL,
    slug VARCHAR(150) NOT NULL,
    category VARCHAR(50) NOT NULL,
    highlight_text VARCHAR(255) NOT NULL,
    description TEXT,
    opening_hours_text VARCHAR(255),
    price_text VARCHAR(100),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    google_maps_url TEXT,
    image_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (city_id, slug)
);

CREATE TABLE promotions (
    id SERIAL PRIMARY KEY,
    city_id INT NOT NULL REFERENCES cities(id) ON DELETE RESTRICT,
    event_id INT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    venue_id INT NOT NULL REFERENCES venues(id) ON DELETE RESTRICT,
    editorial_date DATE NOT NULL,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    price_cents INT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_promotions_active
ON promotions (starts_at, ends_at, status);

-- Garantiza que solo pueda existir una promoción activa por ciudad y día editorial
CREATE UNIQUE INDEX uq_promotions_city_editorial_date
ON promotions (city_id, editorial_date)
WHERE status = 'active';

CREATE TABLE event_metrics (
    id SERIAL PRIMARY KEY,
    event_id INT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    promotion_id INT REFERENCES promotions(id) ON DELETE SET NULL,
    metric_type VARCHAR(50) NOT NULL,
    channel VARCHAR(50) NOT NULL,
    session_hash VARCHAR(64),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata JSONB
);

CREATE INDEX idx_event_metrics_event
ON event_metrics (event_id, metric_type, occurred_at);

-- Permite calcular acciones únicas por sesión anónima
CREATE INDEX idx_event_metrics_unique_action
ON event_metrics (event_id, metric_type, session_hash, occurred_at);

CREATE TABLE qr_sources (
    id SERIAL PRIMARY KEY,
    city_id INT NOT NULL REFERENCES cities(id) ON DELETE RESTRICT,
    accommodation_name VARCHAR(150) NOT NULL,
    accommodation_type VARCHAR(50),
    qr_code VARCHAR(100) UNIQUE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 4. Enumeraciones

### Categorías de evento

| Valor | Descripción |
|---|---|
| `musica_directo` | Concierto o música en directo |
| `dj_tardeo` | DJ, tardeo o sesión |
| `monologo` | Monólogo o comedia |
| `cine` | Cine |
| `teatro` | Teatro |
| `exposicion` | Exposición |
| `cultura` | Otra actividad cultural |

### Estados de evento

| Valor | Descripción |
|---|---|
| `tentative` | Recibido o detectado, pendiente de revisión |
| `published` | Verificado y visible |
| `outdated` | Fuera de fecha o pendiente de revisión |
| `cancelled` | Cancelado |
| `archived` | Fuera de agenda, conservado para historial |
| `duplicate` | Duplicado detectado |

### Fuentes

| Valor | Descripción |
|---|---|
| `whatsapp` | Enviado por local o promotor |
| `manual` | Introducido por el operador |
| `web` | Obtenido de web oficial |
| `scraper` | Obtenido mediante scraper |
| `api` | Obtenido mediante integración |
| `user_report` | Reportado por usuario |

### Métricas

| Valor | Descripción |
|---|---|
| `impression` | Visualización de tarjeta |
| `map_click` | Clic en cómo llegar |
| `booking_click` | Clic en reserva |
| `ticket_click` | Clic en entradas |
| `profile_click` | Clic en perfil, web o Instagram |
| `whatsapp_click` | Clic en contacto por WhatsApp |
| `qr_scan` | Escaneo de QR |
| `channel_view` | Visualización en canal |

### Canales

| Valor | Descripción |
|---|---|
| `web` | Web o PWA |
| `whatsapp_channel` | Canal de WhatsApp |
| `qr_hotel` | QR en alojamiento |
| `instagram` | Instagram |
| `tiktok` | TikTok |
| `telegram` | Telegram |

### Estados de promoción

| Valor | Descripción |
|---|---|
| `active` | Campaña activa |
| `scheduled` | Programada para el futuro |
| `completed` | Finalizada |
| `cancelled` | Cancelada |
| `refunded` | Reembolsada |

---

## 5. Reglas de fechas

- `start_time` y `end_time` se almacenan en `TIMESTAMPTZ`.
- La zona horaria por defecto es `Europe/Madrid`.
- `editorial_date` agrupa el evento para el usuario.
- Un evento a las 01:30 del sábado usa `editorial_date = viernes`.
- La API devuelve fechas en ISO 8601 con offset o UTC.

Ejemplo:

```json
{
  "start_time": "2026-10-17T01:30:00+02:00",
  "editorial_date": "2026-10-16",
  "editorial_label": "Viernes noche"
}
```

---

## 6. Deduplicación

La deduplicación no se basa únicamente en un margen horario.

### Señales

1. Mismo `venue_id`.
2. Misma `editorial_date` o fecha cercana.
3. Hora de inicio cercana.
4. Similitud de título.
5. Similitud de imagen.
6. Misma fuente o campaña repetida.

### Reglas

- Si hay coincidencia fuerte: marcar como `duplicate`.
- Si hay duda: mantener `tentative` y enviar a revisión.
- Nunca fusionar automáticamente sin confirmación.
- Conservar la fuente original y la fecha de verificación.

---

## 7. Protecciones de negocio en base de datos

### 7.1 Escasez de promociones

La regla de máximo un evento promocionado por ciudad y día editorial se protege físicamente mediante un índice único parcial:

```sql
CREATE UNIQUE INDEX uq_promotions_city_editorial_date
ON promotions (city_id, editorial_date)
WHERE status = 'active';
```

Esto impide que un error de backend, una operación manual o una petición duplicada active dos promociones activas para el mismo día.

### 7.2 Métricas y sesiones anónimas

`event_metrics.session_hash` almacena un identificador anónimo y rotativo por sesión o día.

No debe contener:

- Dirección IP.
- Identificador publicitario.
- Correo electrónico.
- Número de teléfono.
- Cualquier dato personal identificable.

Permite calcular acciones únicas:

```sql
SELECT
    event_id,
    metric_type,
    COUNT(DISTINCT session_hash) AS unique_actions
FROM event_metrics
GROUP BY event_id, metric_type;
```

### 7.3 Enlace oficial de Google Maps

`venues.google_maps_url` permite usar el enlace oficial del local cuando exista. Si no está disponible, la API genera un enlace de mapa a partir de `latitude` y `longitude`.

Prioridad de mapa:

1. `google_maps_url`, si está verificado.
2. Enlace generado con coordenadas.
3. Búsqueda por nombre y dirección.

---

## 8. Contratos de API

### 8.1 Obtener agenda

```http
GET /api/v1/cities/:citySlug/events?date=2026-10-17&category=musica_directo
```

Respuesta:

```json
{
  "city": {
    "slug": "palencia",
    "name": "Palencia"
  },
  "date": "2026-10-17",
  "events": [
    {
      "id": 123,
      "title": "Concierto acústico",
      "category": "musica_directo",
      "start_time": "2026-10-17T22:30:00+02:00",
      "end_time": null,
      "editorial_date": "2026-10-17",
      "editorial_label": "Sábado",
      "price": {
        "amount_cents": 0,
        "is_free": true,
        "label": "Entrada libre"
      },
      "status": "published",
      "venue": {
        "id": 45,
        "name": "Bar Central",
        "slug": "bar-central",
        "latitude": 42.009,
        "longitude": -4.528,
        "google_maps_url": "https://maps.google.com/?cid=123456789"
      },
      "image_url": "https://cdn.vayaplan.com/events/abc.webp",
      "actions": {
        "maps_url": "https://maps.google.com/?cid=123456789",
        "booking_url": null,
        "tickets_url": null,
        "whatsapp_url": null
      },
      "verification": {
        "source": "whatsapp",
        "verified_at": "2026-10-15T10:12:00+02:00"
      },
      "promotion": null
    }
  ],
  "recurrences": [],
  "places": []
}
```

### 8.2 Obtener fin de semana

```http
GET /api/v1/cities/:citySlug/weekend?start=2026-10-16
```

Devuelve eventos agrupados por `editorial_date`.

### 8.3 Obtener ficha de evento

```http
GET /api/v1/events/:id
```

### 8.4 Obtener lugares

```http
GET /api/v1/cities/:citySlug/places?category=cine
```

### 8.5 Registrar métrica

```http
POST /api/v1/metrics
```

Cuerpo:

```json
{
  "event_id": 123,
  "promotion_id": 78,
  "metric_type": "map_click",
  "channel": "web",
  "session_hash": "sha256-anonymized-daily-session-id"
}
```

### 8.6 Crear borrador desde WhatsApp

```http
POST /api/v1/admin/events/draft
```

Cuerpo:

```json
{
  "city_id": 1,
  "venue_id": 45,
  "title": "Concierto acústico",
  "start_time": "2026-10-16T22:30:00+02:00",
  "editorial_date": "2026-10-16",
  "price_cents": 0,
  "is_free": true,
  "source_type": "whatsapp",
  "source_url": "https://wa.me/...",
  "status": "tentative"
}
```

### 8.7 Crear promoción

```http
POST /api/v1/admin/promotions
```

Cuerpo:

```json
{
  "event_id": 123,
  "city_id": 1,
  "venue_id": 45,
  "editorial_date": "2026-10-17",
  "starts_at": "2026-10-17T00:00:00+02:00",
  "ends_at": "2026-10-18T06:00:00+02:00",
  "price_cents": 1900,
  "status": "active"
}
```

Si ya existe otra promoción activa para esa ciudad y fecha, la base de datos debe rechazar la operación.

---

## 9. Reglas de API

- Todas las respuestas usan JSON.
- Las fechas usan ISO 8601.
- Los importes se representan en céntimos.
- Los endpoints públicos no requieren autenticación.
- Los endpoints administrativos requieren sesión o token.
- Los errores devuelven `error`, `message` y, cuando aplique, `details`.

Ejemplo de error por límite de promoción:

```json
{
  "error": "promotion_limit_reached",
  "message": "Ya existe una promoción activa para Palencia el 2026-10-17",
  "details": {
    "city_id": 1,
    "editorial_date": "2026-10-17"
  }
}
```
