# Catálogo Persistente de Hostelería de Palencia y Cruce de Rutas con Apify

Script reutilizable en TypeScript (`scripts/apify-google-maps-extract.ts`) para extraer un catálogo amplio y persistente de hostelería desde Google Maps mediante el actor `scraperlink/google-maps-scraper` en Apify, normalizarlo, deduplicarlo por `place_id`, validar coordenadas geográficas y cruzarlo con los participantes oficiales de la Ruta del Pucherito 2025.

---

## 1. Actor de Apify Utilizado
- **Actor**: `scraperlink/google-maps-scraper`
- **Fuente**: Google Maps Places / Business listings (modo búsqueda amplia / categoría)
- **Coste**: A partir de $0,40 USD por 1.000 resultados (~$0,0004 USD por local).
- **Parámetros de extracción**:
  ```json
  {
    "query": [
      "restaurantes en Palencia",
      "bares en Palencia",
      "mesones en Palencia",
      "asadores en Palencia",
      "cervecerías en Palencia",
      "hoteles en Palencia"
    ],
    "num": 200,
    "gl": "es",
    "hl": "es",
    "popularTimes": false,
    "reviews": false,
    "maxReviews": 0,
    "maxImages": 0
  }
  ```
  Sin activación de reviews ni Popular Times ni campos de pago extra.

---

## 2. Configuración de Seguridad (`APIFY_TOKEN`)

> [!CAUTION]
> **Seguridad Estricta del Token**:
> - El token de Apify se lee **exclusivamente** desde `process.env.APIFY_TOKEN`.
> - **NUNCA** se acepta por línea de comandos ni se escribe en código, commits, tests, logs, CSV, JSON o documentación.
> - Si no está definido, el script aborta inmediatamente con:
>   `APIFY_TOKEN no está configurado. Configúralo como variable de entorno antes de ejecutar la extracción.`

---

## 3. Dataset Persistente y Estructura de Directorios

Todos los datos se guardan en un directorio versionable para reutilización sin re-extraer ni incurrir en costes adicionales:

```text
data/google-maps/palencia-hospitality/
  raw/
    apify-raw-results-<timestamp>.json
  normalized/
    palencia-hospitality-catalog.json
    palencia-hospitality-catalog.csv
  matches/
    pucherito-2025-match-results.json
    pucherito-2025-match-results.csv
```

### Reglas del Catálogo
1. **Persistencia Raw**: Conserva la respuesta íntegra de Apify con `extraction_date`, `apify_run_id`, `queries` y metadatos de ejecución.
2. **Normalización y Deduplicación**: Cada local aparece una única vez indexado por su Google Maps `place_id`. Si aparece en múltiples búsquedas, se registran en `found_in_queries` y se consolida la información más completa.
3. **Validación de Coordenadas**: Se extraen `latitude` y `longitude`, validando que sean números válidos dentro del margen geográfico de Palencia (lat: `41.5` a `42.5`, lng: `-5.2` a `-4.0`). Coordenadas fuera de rango o ausentes se fijan a `null`.
4. **Política de Caché**: Si ya existe `palencia-hospitality-catalog.json`, el pipeline reutiliza el catálogo local sin llamar a Apify, salvo que se invoque con `--force`.

---

## 4. Cruce con la Ruta del Pucherito 2025

El cruce evalúa los 22 locales oficiales contra el catálogo normalizado:
- **`MATCHED`** (`match_score >= 0.80`): Coincidencia clara de nombre y dirección.
- **`NEEDS_MANUAL_REVIEW`** (`0.50 <= match_score < 0.80`): Coincidencia parcial, discrepancia de número o ambigüedad entre varios locales cercanos.
- **`NOT_FOUND`** (`match_score < 0.50`): Sin candidato razonable en el catálogo.

---

## 5. Modos de Ejecución

### Prueba Previa Obligatoria (1 búsqueda de categoría)
Ejecuta únicamente `"restaurantes en Palencia"` (num: 200) para validar la cadena de persistencia, deduplicación y cruce:
```bash
bun run scripts/apify-google-maps-extract.ts --pretest
```

### Extracción Completa (6 búsquedas autorizadas)
*(Requiere autorización expresa previa)*
```bash
bun run scripts/apify-google-maps-extract.ts --full
```
