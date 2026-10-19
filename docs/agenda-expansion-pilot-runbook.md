# Manual Operativo y Técnico — Piloto de Ampliación de Agenda (VayaPlan)

**Versión:** 1.0  
**Ámbito territorial:** Palencia capital  
**Rama:** `feat/agenda-expansion-pilot`  
**Fecha:** 19 de octubre de 2026

---

## 1. Conector Oficial e Ingesta JCyL

### 1.1 CLI Oficial Vigente
- **Ruta oficial:** `scripts/jcyl-sync-cli.ts`.
- **Vigencia:** Es la **única CLI vigente documentada** para la sincronización e ingesta cultural desde la Junta de Castilla y León.
- **Modo de ejecución:**
  ```bash
  # Modo Dry-Run por defecto (consulta remota, normalización en memoria, 0 escrituras):
  bun run scripts/jcyl-sync-cli.ts

  # Modo Escritura (exclusivamente con bandera explícita en entornos de test o autorizados):
  bun run scripts/jcyl-sync-cli.ts --execute-writes
  ```

### 1.2 Endpoint Oficial y Filtros
- **Endpoint real usado por HEAD:**
  ```text
  https://analisis.datosabiertos.jcyl.es/api/explore/v2.1/catalog/datasets/eventos-de-la-agenda-cultural-categorizados-y-geolocalizados/records
  ```
- **Parámetros OData documentados:**
  - `where=nombre_localidad='Palencia'`
  - `order_by=fecha_inicio asc`
  - `limit=50`

### 1.3 Mecanismo Dry-Run
- **Descripción exacta:** El modo dry-run retorna antes de cualquier acceso a base de datos. No ejecuta INSERT, UPDATE, BEGIN ni ROLLBACK.
- **Sin transacciones revertidas:** El dry-run no interactúa con el motor relacional de base de datos ni ejecuta transacciones revertidas. El código retorna inmediatamente en memoria tras recuperar y normalizar los candidatos (`if (dryRun) return result;` en `apps/api/src/services/jcyl-import/jcyl-connector.ts`).

---

## 2. Estado y Origen del Evento 8 en Producción

- **Naturaleza del registro:** El evento 8 en la base de datos de producción (`vayaplan`, título `Festival Jazz`, `venue_id = 2`, `status = 'outdated'`) es una prueba del usuario para cargar y visualizar un cartel, con título relacionado con jazz.
- **Sin reconciliación con festival:** No debe reconciliarse con conciertos ni funciones reales del *XIII Jazz Palencia Festival*. No debe desdoblarse, reactivarse ni asignarse a otras fechas.
- **Decisión editorial:** Permanece inalterado en producción a la espera de una decisión editorial aislada sobre su eventual retirada o archivo.

---

## 3. Separación Estricta del Censo de Recintos

### 3.1 Recintos Reales en Producción (`vayaplan`)
- **ID 1:** Bar Universonoro
- **ID 2:** Teatro Principal de Palencia

### 3.2 Recintos No Censados en Producción
- *Biblioteca Pública de Palencia*, *Centro Cultural Lecrác*, *Pabellón Municipal de Deportes «Marta Domínguez»* y *Estadio Municipal Nueva Balastera* **no están censados en producción**.
- **Regla estricta:** No se deben asignar, asumir ni proponer identificadores productivos para estos espacios hasta que se ejecute y verifique su correspondiente migración o alta censal autorizada.

### 3.3 Fixtures de Capturas Visuales
- Los IDs `1` (Teatro Principal), `2` (Biblioteca Pública), `3` (Lecrác) y `10` (Pabellón Marta Domínguez) proceden única y exclusivamente de la fixture local de pruebas visuales definida en `scratch/capture_admin_flow.ts` para renderizado en Chromium headless. No representan ni deben confundirse con datos censales de la base de datos de producción.

---

## 4. Registro e Identificadores JCyL

- **Villamuriel de Cerrato (Descartado por término municipal):**
  - **ID Oficial:** `1285645015428`
  - **Título:** *'La cocina'* (Teloncillo Teatro) en Teatro Jesús Meneses.
  - **Motivo de exclusión:** Su municipio es Villamuriel de Cerrato (`nombre_localidad != 'Palencia'`).
- **Biblioteca Pública de Palencia (Aceptado):**
  - **ID Oficial:** `1285184301373`
  - **Título:** *Exposición de fotografía 'Una mirada sincera' de Agustín Hernández*.
  - **Motivo de admisión:** Perteneciente al término municipal de Palencia y recinto biblioteca pública (`codigo_biblioteca = 'BPPAL'`).
- **ID `1285645015421` (Fixture Sintética):**
  - Corresponde a una fixture sintética creada en `scratch/capture_admin_flow.ts` (*Taller Infantil*) y a una errata de redacción en informes previos. No debe utilizarse en ejemplos reales futuros ni confundirse con los registros oficiales de la Junta.
