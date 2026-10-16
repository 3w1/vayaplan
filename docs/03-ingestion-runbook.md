# VayaPlan — Protocolo de Ingesta y Manual Operativo

**Versión:** 1.0  
**Ciudad piloto:** Palencia  
**Fecha:** 14 de octubre de 2026

---

## 1. Objetivo

Mantener una agenda local fiable con el menor esfuerzo operativo posible.

El objetivo del piloto no es automatizar todo desde el primer día, sino establecer un proceso repetible que permita:

- Recibir eventos fácilmente.
- Validar datos antes de publicar.
- Evitar duplicados.
- Detectar cancelaciones.
- Medir el tiempo real de curación.

---

## 2. Canales de entrada

| Canal | Prioridad | Uso |
|---|---|---|
| WhatsApp Business | Principal | Locales y promotores envían cartel, texto o enlace |
| Revisión manual | Secundaria | Cine, teatro, exposiciones y webs oficiales |
| Scraper | Futuro | Automatización posterior de fuentes estables |
| Reporte de usuario | Complementario | Avisos de cambio, cancelación o evento no publicado |

---

## 3. Flujo de ingesta por WhatsApp

### 3.1 Mensaje de bienvenida

```text
Hola 👋

Soy VayaPlan, la agenda de ocio de Palencia.

Para publicar tu evento gratis, envíanos:
1. Foto o cartel.
2. Día y hora.
3. Precio o “entrada libre”.
4. Enlace de reservas o entradas, si lo tienes.

Ejemplo:
“Concierto acústico este viernes a las 22:30, entrada libre.”

Lo revisamos y lo publicamos en vayaplan.com/palencia.
```

### 3.2 Flujo operativo

1. El local envía mensaje.
2. El operador abre el panel de curación.
3. Crea un borrador con estado `tentative`.
4. Valida los campos obligatorios.
5. Publica el evento o lo marca como duplicado.
6. Registra el tiempo empleado.

### 3.3 Campos obligatorios

- Título.
- Local.
- Fecha y hora.
- Precio o entrada libre.
- Categoría.
- Fuente.

### Campos opcionales

- Descripción.
- Imagen.
- Enlace de reserva.
- Enlace de entradas.
- Enlace a Instagram.
- Hora de fin.

---

## 4. Plantilla de evento

```text
Título:
Local:
Dirección:
Fecha:
Hora:
Precio:
Categoría:
Enlace de reserva:
Enlace de entradas:
Instagram:
Notas:
Fuente:
```

Ejemplo completado:

```text
Título: Concierto acústico — Tributo a Fito
Local: Bar Central
Dirección: Calle Mayor 12, Palencia
Fecha: viernes 16 de octubre
Hora: 22:30
Precio: Entrada libre
Categoría: música_directo
Enlace de reserva: —
Enlace de entradas: —
Instagram: @barcentral
Notas: Aforo limitado
Fuente: WhatsApp del local
```

---

## 5. Reglas de validación

### 5.1 Antes de publicar

Un evento debe cumplir:

- Título claro.
- Local identificado.
- Fecha y hora correctas.
- Precio o entrada libre.
- Categoría correcta.
- Imagen legible, si existe.
- Enlace funcional, si existe.

### 5.2 Errores habituales

| Error | Acción |
|---|---|
| Fecha ambigua | Confirmar con el local o descartar |
| “Este viernes” sin fecha | Calcular fecha y verificar |
| Evento de madrugada | Asignar fecha editorial correcta |
| Precio poco claro | Marcar como pendiente o consultar |
| Local no censado | Crear ficha de venue |
| Cartel ilegible | Solicitar texto al local |
| Evento repetido | Marcar como duplicado |

---

## 6. Deduplicación

No se usa un margen horario único. La detección combina varias señales:

1. Mismo local.
2. Misma fecha editorial o fecha cercana.
3. Hora de inicio cercana.
4. Similitud de título.
5. Similitud de imagen.
6. Misma fuente o campaña repetida.

### Decisión

| Situación | Acción |
|---|---|
| Coincidencia clara | Marcar como `duplicate` |
| Coincidencia parcial | Mantener `tentative` y revisar |
| Cambio de horario | Actualizar evento original |
| Cambio de fecha | Actualizar evento original |
| Cancelación | Cambiar a `cancelled` |
| Evento nuevo | Publicar como evento independiente |

---

## 7. Ciclo de vida

```text
Recibido → Tentative → Revisión → Published → Outdated → Archived
                                  ↘ Cancelled
                                  ↘ Duplicate
```

### Estados

| Estado | Cuándo se usa |
|---|---|
| `tentative` | Borrador pendiente de validación |
| `published` | Evento verificado y visible |
| `outdated` | Fuera de fecha o necesita revisión |
| `cancelled` | Evento cancelado |
| `archived` | Fuera de agenda, conservado para historial |
| `duplicate` | Duplicado detectado |

---

## 8. Rutina semanal

### Lunes

- Revisar eventos de la semana.
- Archivar eventos caducados.
- Enviar informes de campañas promocionadas.
- Registrar horas dedicadas.

### Miércoles

- Revisar cartelera de cine.
- Revisar teatro y exposiciones.
- Contactar locales sin eventos publicados.
- Preparar borradores del fin de semana.

### Jueves

- Validar todos los eventos del viernes, sábado y domingo.
- Preparar mensaje del canal.
- Publicar selección editorial.

### Viernes

- Revisión final de la agenda.
- Publicar mensaje semanal.
- Comprobar cambios de última hora.

### Sábado y domingo

- Revisar cancelaciones.
- Corregir errores urgentes.
- Registrar incidencias.

---

## 9. Control de calidad

### Objetivos del piloto

- Revisar eventos nuevos al menos una vez al día.
- Revisar la agenda del fin de semana el jueves y viernes.
- Mantener errores materiales por debajo del 5%.
- Detectar cancelaciones lo antes posible.
- Registrar tiempo de curación por evento.

### Definición de error material

Se considera error material:

- Fecha incorrecta.
- Hora incorrecta.
- Local incorrecto.
- Evento cancelado no actualizado.
- Precio incorrecto.
- Evento duplicado visible.

---

## 10. Métricas operativas

| Métrica | Objetivo inicial |
|---|---|
| Tiempo medio por evento | Medir y reducir semana a semana |
| Eventos duplicados | 0 visibles |
| Errores materiales | < 5% |
| Cancelaciones detectadas tarde | Minimizar |
| Horas semanales de curación | Medir desde la semana 1 |
| Eventos publicados por fin de semana | 15–20 en el arranque |

---

## 11. Automatización progresiva

### Fase 1: manual-first

- WhatsApp + panel de curación.
- Carga manual de cine y teatro.
- Plantillas de texto.
- Métricas básicas.

### Fase 2: semiautomática

- OCR o modelo de visión para carteles.
- Borrador automático.
- Detección de duplicados.
- Aprobación en un clic.

### Fase 3: automatización de fuentes estables

- Scraping de webs públicas.
- Feeds RSS o iCal.
- Integraciones con cines y teatros.
- Alertas de cambios.

---

## 12. Reglas de privacidad

- No publicar datos personales de contactos.
- No compartir números de teléfono privados.
- No almacenar conversaciones completas sin necesidad.
- Usar solo datos necesarios para publicar el evento.
- Cumplir RGPD y política de privacidad.

---

## 13. Censo de Locales y Metadatos de Venues (Palencia)

En la Fase 2 de Ingesta se introduce la separación de migraciones:
- `infra/migrations/004_add_venue_metadata.sql`: DDL aditivo para columnas auxiliares.
- `infra/migrations/005_seed_palencia_venues.sql`: Semilla y censo auditado de locales.

### 13.1 Metadatos de Local (Migración 004 DDL)
- `zone VARCHAR(50)`: Zonas geográficas de ocio (`seminario`, `centro_puebla`, `salon`, `otros`).
- `category VARCHAR(50)`: Tipología del local (`general`, `bar_musical`, `disco_bar`, `bar`, `sala_conciertos`, `pub`, `discoteca`, `teatro`, `cine`).
- `phone VARCHAR(50)`: Teléfono de contacto general (independiente de `whatsapp_contact`).
- `website_url TEXT`: URL corporativa o canal de difusión (preexistente en esquema base 001).

### 13.2 Reglas de Preservación de Identidades y Censo (Migración 005)
- Unicidad compuesta: `UNIQUE (city_id, slug)`.
- `universonoro` (ID 1) y `teatro-principal` (ID 2) conservan sus IDs y slugs canónicos.
- `local-por-verificar-borrador` (ID 9999) es el local contingente oficial para eventos sin espacio asignado en Palencia.
- `Sky Bar Palencia` y `Manhattan copas palencia` se mantienen como dos registros diferenciados en Cardenal Almaraz, 4 y 6.
- `Jimmy Jazz` está cerrado y no se incluye en el censo activo.
- `La Gomila` se clasifica bajo categoría `pub`.
- Ajustes de secuencia no decrecientes respecto a `last_value` y `MAX(id)`. Nótese que `nextval` y `setval` son operaciones no transaccionales (no se revierten con rollback); el INSERT masivo evalúa el valor por defecto para todas las filas candidatas antes de la resolución de conflictos, por lo que consume saltos de secuencia para las filas actualizadas sin exigir identificadores consecutivos.
- Preservación de estado `is_active` en locales inactivos y preservación de datos ya corregidos vía `COALESCE`.
- Guarda estricta: en base `vayaplan` se exige incondicionalmente `vayaplan.confirm_production_seed = 'true'` evaluado mediante `IS DISTINCT FROM 'true'`, no siendo suficiente `allow_census_seed`.


---

## 14. Estado del Incremento de Ingesta y Curación (Rama `feat/cultural-agenda-curation`)

### 14.1 Implementado
- **Cálculo de Jornada Editorial**: Función `computeEditorialDate` en `@vayaplan/shared` normalizando a `Europe/Madrid` con umbral a las 06:00 AM.
- **Servicio de Ingesta JCyL**: `ingestCulturalAgenda()` en `@vayaplan/api` con filtrado por municipio Palencia, deduplicación por `source_hash`, matching contra el censo y asignación contingente a venue 9999.
- **Endpoint Administrativo**: `POST /api/v1/admin/ingest/cultural-agenda` bajo autenticación admin.
- **Metadatos y Tipos de Venues**: `VenueZone`, `VenueCategory`, `CollisionAlertInfo` en `@vayaplan/types` y columnas `zone`, `category`, `phone` en `Venue`.
- **Esquema Separado**: Archivo `infra/migrations/004_add_venue_metadata.sql` (DDL aditivo, timeouts acotados y verificación de compatibilidad de tipos).
- **Censo Auditado**: Archivo `infra/migrations/005_seed_palencia_venues.sql` con 56 locales, resolución dinámica de `city_id`, preservación de IDs canónicos (1, 2), locales inactivos y secuencia no decreciente.
- **Panel de Curación**: Pestañas de subfiltros (Todos, Tentative, Venue 9999, Colisiones), caja no invasiva de alerta horaria ($\le 2\text{h}$) y modal interactivo de reasignación rápida de local.
- **Seguridad en Publicación**: Bloqueo de publicación en cliente y servidor (`POST /events/:id/publish`) si `venue_id = 9999`.
- **Parser de Fecha PostgreSQL**: Corrección en `@vayaplan/db` para retornar DATE (OID 1082) como string puro `YYYY-MM-DD` sin mutación por huso horario.

### 14.2 Probado en Test y Ensayo
- **19/19 tests unitarios**: En `packages/shared/src/index.test.ts` (CEST, CET, UTC, fin de mes, cambio de año).
- **1/1 test de regresión DATE**: En `packages/db/src/index.test.ts`.
- **Ensayo desde esquema base**: Validado en base aislada temporal (001 + 002 + 004 + 005).
- **Idempotencia validada**: 0 duplicados en segundas pasadas.
- **Secuencia no decreciente validada**: Comprobada preservación ante secuencia adelantada.
- **Bloqueo y Reasignación validados**: 400 en venue 9999, preservación de `tentative` en PATCH y posterior publicación exitosa en agenda pública.

### 14.3 Pendiente de Autorización para Producción
- **Autorización explícita requerida**: No se ejecutan cambios en producción (`vayaplan`) ni reconstrucción de contenedores de producción hasta contar con autorización.
- **Estado Actual**: Producción permanece intacta al 100%.
