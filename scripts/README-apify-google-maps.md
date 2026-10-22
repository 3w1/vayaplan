# Extracción y Enriquecimiento de Locales con Apify Google Maps

Script reutilizable en TypeScript (`scripts/apify-google-maps-extract.ts`) para consultar, extraer y normalizar datos de establecimientos hosteleros desde Google Maps mediante la plataforma Apify, cruzándolos de forma contrastada y sin invención de datos.

---

## 1. Actor de Apify Utilizado
- **Actor**: `scraperlink/google-maps-scraper`
- **Fuente**: Google Maps Places / Business listings
- **Coste estimado**: Desde $0,40 USD por cada 1.000 resultados.
  - Para 1 consulta (máx. 5 resultados): ~$0,0004 a $0,0020 USD (< 0,002 €).
  - Para 22 consultas (máx. 110 resultados): ~$0,0088 a $0,0440 USD (< 0,05 €).

### Parámetros de Extracción
Para optimizar el coste y evitar cargos no deseados, la llamada se configura estrictamente sin reviews ni Popular Times:
```json
{
  "query": ["<nombre oficial> <dirección oficial> Palencia"],
  "num": 10,
  "gl": "es",
  "hl": "es",
  "popularTimes": false,
  "reviews": false,
  "maxReviews": 0,
  "maxImages": 0
}
```

---

## 2. Configuración de Seguridad (`APIFY_TOKEN`)

> [!CAUTION]
> **Seguridad Estricta del Token**:
> - El token de Apify **NUNCA** debe escribirse en código, commits, tests, logs, issues ni archivos de documentación.
> - **NUNCA** pases el token como argumento de línea de comandos (el script rechaza activamente `--token`).
> - Asegúrate de que los archivos `.env` permanezcan ignorados en `.gitignore`.

Configura la variable de entorno antes de ejecutar:
```bash
export APIFY_TOKEN="<tu_token_de_apify>"
```

Si la variable no está definida, el script aborta inmediatamente con código de salida 1:
```
APIFY_TOKEN no está configurado. Configúralo como variable de entorno antes de ejecutar la extracción.
```

---

## 3. Comandos de Ejecución

### Prueba Controlada (1 local: Restaurante San Remo)
```bash
bun run scripts/apify-google-maps-extract.ts \
  --input scripts/data/pucherito-2025-test-one.json \
  --output output/apify-google-maps-results.json
```

### Extracción del Lote Completo (22 locales oficiales)
*(Requiere autorización expresa previa)*
```bash
bun run scripts/apify-google-maps-extract.ts \
  --input scripts/data/pucherito-2025-input.json \
  --output output/apify-google-maps-results.json
```

El script genera automáticamente dos artefactos en la ruta de salida indicada:
1. `output/apify-google-maps-results.json`: Datos estructurados completos, incluyendo candidatos crudos (`raw_result`).
2. `output/apify-google-maps-results.csv`: Tabla para revisión rápida y hojas de cálculo.

---

## 4. Interpretación de Estados (`match_status`)

| Estado | Criterio | Acción Requerida |
| :--- | :--- | :--- |
| **`MATCHED`** | Coincidencia de alta confianza tanto en nombre como en dirección (`match_score >= 0.80`). | Candidato validado para cotejo contra catálogo de venues. |
| **`NEEDS_MANUAL_REVIEW`** | Coincidencia parcial (`0.50 <= score < 0.80`), ambigüedad entre varios locales o discrepancia de numeración. | Curación humana: abrir `google_maps_url`, validar si es el establecimiento real y confirmar o descartar. |
| **`NOT_FOUND`** | Apify respondió correctamente pero Google Maps no devolvió resultados razonables (`score < 0.50`). | Búsqueda manual alternativa o verificación de si el local ha cambiado de denominación comercial o cerrado. |
| **`ERROR`** | Fallo técnico (red, error 401 de token, timeout, error en dataset de Apify tras 2 reintentos). | Revisar `error_message`, verificar saldo/conectividad de Apify y reejecutar. |

---

## 5. Qué hacer con `NEEDS_MANUAL_REVIEW` y `NOT_FOUND`
1. **Revisión en Hoja de Cálculo o JSON**: Filtrar los registros cuyo `match_status` sea `NEEDS_MANUAL_REVIEW` o `NOT_FOUND`.
2. **Cotejo con Fuente Oficial**: Comprobar el nombre en la convocatoria del Ayuntamiento de Palencia.
3. **Validación en Google Maps**: Verificar si el local opera bajo un rótulo ligeramente distinto (ej. `"Casero by Caway"` frente a `"Restaurante Casero"`).
4. **Cero Invención**: Si un dato no se localiza de forma fehaciente, no se introduce en el catálogo productivo ni en la base de datos.
