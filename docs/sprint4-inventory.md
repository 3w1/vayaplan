# Inventario de Solo Lectura — Sprint 4

> **Generado**: 2026-10-16T11:54 CEST  
> **Repositorio**: `/root/vayaplan`  
> **Rama local**: `main` (HEAD `f723939`, 4 commits por detrás de `origin/main`)  
> **Cero cambios realizados**

---

## 1. Estado Git

### Ramas
| Referencia | SHA | Estado |
| :--- | :--- | :--- |
| `main` (local) | `f7239390869fed771dcc26fcebdc4f1f8348fb65` | 4 commits detrás de `origin/main` |
| `origin/main` | `424ae8b3f7f891560c5ff3aaa230f009f4a3e096` | Merge commit de `feat/cultural-agenda-curation` |

El clon `/root/vayaplan` **nunca recibió `git pull`** tras el merge de curación. Su `HEAD` apunta al commit previo a la rama de curación.

### Cambios Locales No Commiteados (Sprint 4)

**12 archivos modificados (unstaged), sin nada en staged, sin commits:**

```
 apps/api/src/index.ts               |    9 +-
 apps/api/src/routes/admin/events.ts | 137 ++++-
 apps/api/src/routes/events.ts       |   8 +-
 apps/api/src/routes/single-event.ts |   6 +-
 apps/api/src/routes/weekend.ts      |   6 +-
 apps/api/src/services/expiration.ts |  59 +++
 apps/web/src/admin.ts               | 994 +++++++++++++++++++++++++++++++++--
 bun.lock                            |  66 +++
 docs/03-ingestion-runbook.md        |  20 +
 packages/db/src/index.ts            |   5 +-
 packages/shared/src/index.ts        |  47 ++
 packages/types/src/index.ts         | 103 ++++
 12 files changed, 1394 insertions(+), 66 deletions(-)
```

**Archivos untracked relevantes:**
| Archivo/Directorio | Descripción |
| :--- | :--- |
| `apps/api/src/routes/admin/promotions.ts` | Nuevo módulo CRUD de promociones (nuevas rutas admin) |
| `apps/api/src/services/ingestion.ts` | Servicio de ingesta (idéntico al de `origin/main`) |
| `infra/migrations/003_sprint4_promotions_lifecycle.sql` | Migración DDL Sprint 4: índice único parcial de promociones |
| `infra/migrations/004_seed_palencia_venues.sql` | **Versión anterior del censo** (sin separación schema/seed) |
| `infra/fixtures/sprint4_test_fixtures.sql` | Fixtures de test Sprint 4 |
| `packages/shared/src/index.test.ts` | Tests unitarios de `computeEditorialDate` |
| `docs/prompts-sprint-04.md` | Documento de diseño del Sprint 4 |
| `docs/design/archive/`, `docs/design/preview/`, `docs/design/vayaplan-mobile-reference.png` | Assets de diseño |
| `backups/` | Backup pre-Sprint 4 del 14 Oct (`vayaplan_pre_sprint4_20261014_194132.dump`) |

---

## 2. Resumen Funcional de Sprint 4

### Objetivo
Completar el ciclo comercial de VayaPlan: gestión de promociones editoriales de pago, informes de métricas atribuibles a cada promoción y exportación de informe WhatsApp para el equipo comercial.

### Funcionalidades Implementadas

#### A. Gestión de Promociones (`apps/api/src/routes/admin/promotions.ts`) — NUEVO ARCHIVO
CRUD completo bajo `/api/v1/admin/promotions`:
- `GET /promotions` — Lista con filtros por estado, ciudad, fecha editorial.
- `POST /promotions` — Creación de promoción vinculada a evento y local.
- `GET /promotions/:id` — Detalle con métricas de promoción y evento.
- `PATCH /promotions/:id` — Actualización parcial.
- `GET /promotions/:id/report` — Informe de métricas con formato JSON o `?format=text`.
- `GET /promotions/:id/report/text` — Descarga directa del informe como texto plano listo para WhatsApp.
- Registro y cálculo de 12 métricas por promoción: impresiones, sesiones únicas, clics de mapa, reserva, ticket, WhatsApp, perfil, canal, QR, acciones totales.

#### B. Ciclo de Vida Automático de Promociones (`apps/api/src/services/expiration.ts`) — MODIFICADO
- Nueva función `runPromotionLifecycleCheck()`:
  - `scheduled → active` cuando `starts_at <= now() < ends_at`.
  - `active|scheduled → completed` cuando `ends_at <= now()`.
  - Integrada en el worker existente `startExpirationWorker()` (cada 600 s + arranque diferido 5 s).

#### C. Corrección del JOIN de Promociones en Rutas Públicas — MODIFICADO
**`apps/api/src/routes/events.ts`, `single-event.ts`, `weekend.ts`:**
- El JOIN contra `promotions` pasa de `p.status = 'active'` a:
  ```sql
  AND p.city_id = e.city_id
  AND p.status IN ('active', 'scheduled')
  AND p.starts_at <= now()
  AND p.ends_at > now()
  ```
- Los eventos con promoción activa se reordenan primero en el listado (`CASE WHEN p.id IS NOT NULL THEN 0 ELSE 1 END`).

#### D. Migración DDL `003_sprint4_promotions_lifecycle.sql` — NUEVA (untracked)
Sustituye el índice único `uq_promotions_city_editorial_date` por una versión parcial:
```sql
CREATE UNIQUE INDEX uq_promotions_city_editorial_date
ON promotions (city_id, editorial_date)
WHERE status IN ('active', 'scheduled');
```
Con precheck de conflictos antes de ejecutar.

#### E. Panel de Administración (`apps/web/src/admin.ts`) — MODIFICADO EXTENSAMENTE (+994 líneas netas)
- Pestaña de **Promociones**: creación, listado, detalle, envío a WhatsApp y actualización de estado.
- Integración del informe de métricas comerciales en el modal de cada promoción.
- Filtro `has_collision` en la vista de eventos (heredado del trabajo de curación ya en main).

#### F. Tipos Sprint 4 (`packages/types/src/index.ts`) — MODIFICADO (+103 líneas)
Nuevas interfaces exportadas:
- `AdminPromotionItem`
- `PromotionReportMetricsBlock`
- `PromotionReportResponse`
- `CreatePromotionInput`

#### G. Registro de Ruta en Servidor (`apps/api/src/index.ts`) — MODIFICADO
- Import y montaje de `adminPromotionsRoutes`.
- `export const app` (para importabilidad en tests).
- `hostname` expuesto en el objeto de configuración de Bun.

#### H. `bun.lock` — MODIFICADO
Actualización de lockfile por nuevas dependencias indirectas.

#### I. `docs/03-ingestion-runbook.md` — MODIFICADO (versión sin separación)
Añade sección `§13` con metadatos de venues pero **apunta a una única migración** `004_seed_palencia_venues.sql` (la versión pre-separación), sin hacer referencia a la separación DDL/censo ni a la guarda `IS DISTINCT FROM`.

---

## 3. Análisis de Solapamientos con `origin/main` (Post-Curación)

### Diagnóstico Global
El Sprint 4 fue desarrollado sobre el commit `f723939` (base pre-curación). `origin/main` ya incorpora los cambios de `feat/cultural-agenda-curation` (merge commit `424ae8b`). La integración requerirá un **rebase o merge** sobre `origin/main`.

### Mapa de Solapamientos por Archivo

| Archivo | Riesgo | Naturaleza del Solapamiento | Estrategia |
| :--- | :---: | :--- | :--- |
| `apps/api/src/index.ts` | 🟡 **Medio** | Ambas ramas añaden la misma lógica `hostname`, pero Sprint 4 añade además `adminPromotionsRoutes`. El diff es semánticamente compatible pero el bloque será conflictivo para git. | Aceptar ambas modificaciones; resolver manualmente tomando la suma de los dos diffs. |
| `apps/api/src/routes/admin/events.ts` | 🟢 **Bajo** | El código resultante en `origin/main` **ya incluye** todas las adiciones de Sprint 4 en este archivo (`collision_alert`, `hasCollision`, `venue_zone`, `ingest/cultural-agenda`, bloqueo venue 9999). El Sprint 4 no añade nada nuevo aquí. | Al hacer rebase/merge, este archivo queda **idéntico**; no habrá conflicto funcional. |
| `apps/api/src/routes/events.ts` | 🟡 **Medio** | Ambas ramas modifican el mismo JOIN de promotions y el ORDER BY. La versión de `origin/main` tiene el cambio correcto (`starts_at`/`ends_at` acotados); el Sprint 4 tiene el mismo cambio. | Idéntico en contenido; git puede marcarlo como conflicto de texto dependiendo del punto de divergencia. Resolver aceptando la versión de `origin/main`. |
| `apps/api/src/routes/single-event.ts` | 🟡 **Medio** | Idem `events.ts`. Mismo cambio de JOIN en ambas ramas. | Resolver tomando `origin/main`; son equivalentes. |
| `apps/api/src/routes/weekend.ts` | 🟡 **Medio** | Idem. | Idem. |
| `apps/api/src/services/expiration.ts` | 🔴 **Alto** | `origin/main` **no tiene** `runPromotionLifecycleCheck()`. Sprint 4 añade esta función nueva y su integración en el worker. El archivo base difiere en línea 53. | Aceptar las adiciones del Sprint 4 **sobre** la versión de `origin/main`. Sin conflicto semántico (adición pura), pero git detectará divergencia. Revisar manualmente. |
| `apps/api/src/services/ingestion.ts` | 🟢 **Ninguno** | Los archivos son **idénticos**: mismo código en `origin/main` y en el worktree local. | No hay acción requerida; `diff` produce salida vacía. |
| `apps/api/src/routes/admin/promotions.ts` | 🟢 **Ninguno** | Archivo **nuevo** en Sprint 4, **no existe** en `origin/main`. | Añadir como archivo nuevo sin conflictos. |
| `apps/web/src/admin.ts` | 🔴 **Alto** | `origin/main` tiene 2054 líneas (con curación integrada). Sprint 4 tiene 2444 líneas (con curación + gestión de promociones añadida). Sprint 4 se construyó **sobre la versión pre-curación** (1060 líneas base), por lo que la gran expansión del panel de promociones puede **solaparse en zonas de inserción** con las adiciones de curación en `origin/main`. | Integración más delicada: hacer rebase del Sprint 4 sobre `origin/main` para que los cambios de curación ya estén presentes. Revisar manualmente las zonas de inserción CSS y JS del modal de promociones vs. el modal de reasignación de venue. |
| `packages/db/src/index.ts` | 🟢 **Ninguno** | El cambio `types.setTypeParser(1082, ...)` es **idéntico** en ambas ramas: ya está en `origin/main`. | Sin conflicto. |
| `packages/shared/src/index.ts` | 🟢 **Ninguno** | La función `computeEditorialDate` es **idéntica** en ambas ramas: ya está en `origin/main`. Sprint 4 añade los mismos 47 líneas que ya están mergeadas. | Al hacer rebase, git lo detectará como ya aplicado (`--skip` o vacío). Sin conflicto funcional. |
| `packages/types/src/index.ts` | 🟡 **Medio** | `origin/main` tiene los tipos de curación (`VenueZone`, `VenueCategory`, `CollisionAlertInfo`, `AdminEventItem` extendido). Sprint 4 añade los tipos de promociones (`AdminPromotionItem`, `PromotionReportResponse`, etc.) al final del archivo. La divergencia es en el bloque final; ambos bloques son aditivos y no se solapan semánticamente. | Aceptar la suma de ambas adiciones. Git resolverá automáticamente si se usa rebase; en merge puede haber conflicto de "fin de archivo". |
| `infra/migrations/003_sprint4_promotions_lifecycle.sql` | 🟢 **Ninguno** | Archivo **nuevo**, no existe en `origin/main`. | Añadir como nuevo. Numeración correcta (003 ya no está ocupado en `origin/main`). |
| `infra/migrations/004_seed_palencia_venues.sql` | 🔴 **Alto** | En `origin/main` existen `004_add_venue_metadata.sql` Y `005_seed_palencia_venues.sql` (versiones separadas y corregidas). El Sprint 4 tiene `004_seed_palencia_venues.sql` (versión anterior no separada, sin guarda `IS DISTINCT FROM`). **El nombre `004` colisiona** con el DDL ya aplicado en producción. | **Descartar** el archivo untracked del Sprint 4. En la rama de Sprint 4 se debe omitir o renombrar. Las migraciones 004 y 005 ya están en producción y en `origin/main`. |
| `docs/03-ingestion-runbook.md` | 🟡 **Medio** | La versión de `origin/main` ya tiene §13 (separación DDL/censo, guarda `IS DISTINCT FROM`) y §14 (estado del incremento). La versión de Sprint 4 tiene una §13 más corta, sin separación. Hay divergencia textual en las mismas secciones. | Conservar la versión de `origin/main` (más completa) y añadir encima las secciones nuevas de Sprint 4 si las hubiera. |
| `bun.lock` | 🟡 **Medio** | Ambas ramas divergen respecto al lockfile base. | Regenerar con `bun install` en la rama final tras el merge para producir un lockfile canónico. No resolver manualmente. |
| `packages/shared/src/index.test.ts` | 🟢 **Ninguno** | Archivo **nuevo** en Sprint 4. Ya existe en `origin/main` (idéntico). | Nada que hacer. |

---

## 4. Plan Recomendado de Integración

> [!IMPORTANT]
> No ejecutar hasta que el equipo decida continuar Sprint 4. Las migraciones 003, 004 (DDL) y 005 (censo) ya aplicadas en producción no se tocan.

### Paso 1 — Crear rama de trabajo Sprint 4
```bash
# Desde /root/vayaplan (NO en /root/vayaplan-curation)
git checkout -b feat/sprint4-promotions origin/main
```
La rama arranca desde `origin/main` (`424ae8b`), que ya incluye curación.

### Paso 2 — Portar los cambios de Sprint 4 sobre la base correcta
Hay dos opciones:

**Opción A (recomendada) — `git stash` + aplicar sobre la nueva rama:**
```bash
git stash
git checkout feat/sprint4-promotions
git stash pop
# Resolver conflictos manualmente (ver tabla de riesgo)
```

**Opción B — Diff parcial y aplicación selectiva:**
```bash
git diff f723939 -- apps/api/src/routes/admin/promotions.ts > /tmp/promotions_route.patch
git diff f723939 -- apps/api/src/services/expiration.ts > /tmp/expiration.patch
# ... aplicar con git apply
```

### Paso 3 — Archivos a resolver manualmente

| Acción | Archivo |
| :--- | :--- |
| **Sumar** adiciones de promotions + curación ya presentes | `apps/api/src/index.ts` |
| **Descartar** versión Sprint 4, usar `origin/main` | `apps/api/src/routes/events.ts`, `single-event.ts`, `weekend.ts` |
| **Añadir** `runPromotionLifecycleCheck` sobre versión de `origin/main` | `apps/api/src/services/expiration.ts` |
| **Añadir** como nuevo (sin conflicto) | `apps/api/src/routes/admin/promotions.ts` |
| **Revisar con cuidado** zonas de inserción JS/CSS | `apps/web/src/admin.ts` |
| **Añadir** bloque Sprint 4 al final, tras tipos de curación ya presentes | `packages/types/src/index.ts` |
| **Añadir** como nuevo (numeración 003 correcta) | `infra/migrations/003_sprint4_promotions_lifecycle.sql` |
| **ELIMINAR / NO AÑADIR** (colisión de nombre y versión obsoleta) | `infra/migrations/004_seed_palencia_venues.sql` (untracked Sprint 4) |
| **Regenerar** (no resolver manualmente) | `bun.lock` |
| **Preservar** la versión de `origin/main` + completar secciones Sprint 4 | `docs/03-ingestion-runbook.md` |

### Paso 4 — Migración de base de datos Sprint 4

Al desplegar Sprint 4, la única migración nueva a aplicar es:
```
infra/migrations/003_sprint4_promotions_lifecycle.sql
```
Las migraciones `004_add_venue_metadata.sql` y `005_seed_palencia_venues.sql` **ya están aplicadas** en producción.

### Paso 5 — Verificación antes de merge
- Ejecutar suite de tests existente.
- Verificar que `runPromotionLifecycleCheck` no interfiere con `runEventExpirationCheck`.
- Verificar que los endpoints de curación siguen respondiendo 200 con la migración 003 aplicada.

---

## 5. Confirmación de Cero Cambios

- No se ha ejecutado `git add`, `git commit`, `git stash`, `git checkout`, `git pull`, `git merge`, `git rebase`, `git push` ni ninguna operación de escritura.
- No se ha modificado, movido, creado ni eliminado ningún archivo.
- No se ha tocado producción, contenedores, ni la base de datos.
- El árbol de trabajo en `/root/vayaplan` se encuentra exactamente en el mismo estado que al inicio de esta sesión de inventario.
