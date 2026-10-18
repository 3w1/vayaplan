# Resumen del Análisis de Candidatos a Censo de Locales (Apify Google Maps)

**Fecha**: 2026-10-17  
**Archivo origen**: `docs/dataset_google-maps-scraper_2026-10-17_16-10-03-342.json`  
**SHA-256 origen**: `87ecab79af5d988e6f557930d59376d9195800f8b842882268b1021a7f74533e`  
**Repositorio**: `vayaplan` (Commit base: `e8b4ce88e2b2c7676fe47e0ce17566ed8cbb4d34`)

---

## 1. Recuentos Globales

| Métrica | Valor | Detalle |
| :--- | :--- | :--- |
| **Total filas originales** | **20** | Registros devueltos por el scraper de Apify |
| **Candidatos únicos consolidados** | **17** | Agrupados por `placeId` canónico no vacío |
| **Filas repetidas absorbidas** | **3** | Filas 12, 13 y 15 (búsqueda duplicada en Plaza Mayor) |
| **Registros sin placeId** | **0** | Todos los registros contienen `placeId` válido de Google |
| **Grupos duplicados por placeId** | **3** | 3 grupos de 2 filas cada uno |

---

## 2. Clasificación de Candidatos Consolidados

| Clasificación | Cantidad | Descripción | Candidatos |
| :--- | :---: | :--- | :--- |
| **POSIBLE_ALTA** | **11** | Establecimientos en Palencia capital sin dudas ni coincidencias en censo | CAND-01, CAND-03, CAND-04, CAND-08, CAND-09, CAND-10, CAND-12, CAND-13, CAND-14, CAND-15, CAND-16 |
| **REVISAR_COINCIDENCIA**| **4** | Dudas internas en el lote (marca próxima o mismo portal/posible sucesión) | CAND-05 y CAND-07 (Don Jamón); CAND-11 y CAND-17 (Plaza Mayor 15) |
| **FUERA_DE_AMBITO** | **2** | 1 en Fuengirola (Málaga) y 1 Hotel/Alojamiento (`qr_sources` ID 1) | CAND-02 (Fuengirola), CAND-06 (Hotel Castilla Vieja) |
| **YA_EXISTENTE** | **0** | Ningún local del censo inicial de venues coincidió | Ninguno |
| **DATOS_INSUFICIENTES** | **0** | Todos los candidatos de Palencia tienen título, dirección y coordenadas válidas | Ninguno |
| **PENDIENTE_COMPARACION**| **0** | La comparación contra el censo de BD se completó en modo solo lectura | Ninguno |
| **TOTAL** | **17** | | |

---

## 3. Metodología de Depuración y Conflictos Detectados

1. **Diferenciación estricta entre búsqueda y resultado**:
   - Búsqueda `"Taberna Plaza Vieja Palencia"` produjo el resultado `"Taberna Plaza Vieja"` situado en Fuengirola (Málaga). Descartado como **FUERA_DE_AMBITO**.
2. **Conflictos entre filas del mismo placeId**:
   - En los 3 pares duplicados (CAND-04, CAND-05, CAND-07), la primera búsqueda (`Taberna Plaza Vieja Palencia`) capturó el horario semanal completo (7 días) y recuento de reseñas, mientras que la segunda (`Bar Plaza Mayor Palencia`) devolvió un horario parcial truncado (solo sábado) y reseñas en `null`.
   - Se preservó la versión más completa sin sobrescribir con valores parciales o nulos.
3. **Separación de Teléfonos y WhatsApp**:
   - **Regla estricta**: Los teléfonos obtenidos de Google Maps (`phone` / `phoneUnformatted`) se mapean al campo `venues.phone` de contacto telefónico general.
   - **Nunca se asignan a `venues.whatsapp_contact`**, el cual permanece `NULL` hasta verificación y consentimiento expreso del establecimiento para mensajería interna.
4. **Diferenciación de URLs**:
   - Se distinguen webs corporativas propias (`website_url`) de perfiles de Instagram (`instagram_handle`) y perfiles de Facebook.

---

## 4. Mapeo al Esquema de Venues

| Campo JSON Apify | Columna en `venues` | Tipo BD | Regla de Transformación |
| :--- | :--- | :--- | :--- |
| `title` | `name` | VARCHAR(150) | Trim, conservación literal del nombre original |
| `title` | `slug` | VARCHAR(150) | Normalización a minúsculas, guiones (`a-z0-9`), unicidad con `city_id` |
| `address` | `address` | VARCHAR(255) | Dirección postal completa |
| `latitude` | `latitude` | DECIMAL(10,8)| Coordenada validada en rango Palencia (~42.0x) |
| `longitude` | `longitude` | DECIMAL(11,8)| Coordenada validada en rango Palencia (~-4.5x) |
| `googleMapsUrl` | `google_maps_url` | TEXT | Enlace canónico a Google Maps |
| `website` (web propia) | `website_url` | TEXT | URL del dominio web oficial |
| `website` (Instagram) | `instagram_handle` | VARCHAR(100)| Extracción del handle de Instagram sin '@' ni parámetros |
| `phone` | `phone` | VARCHAR(50) | Teléfono de contacto general |
| *(ninguno)* | `whatsapp_contact` | VARCHAR(30) | **NULL estricto** (preservación de separación con WhatsApp) |
| *(derivado)* | `zone` | VARCHAR(50) | Asignación heurística (`centro_puebla`, `seminario`, `otros`) sujeta a revisión |
| `categoryName` | `category` | VARCHAR(50) | Mapeo a `bar` o `general` según actividad hostelera |
| *(fijo)* | `city_id` | INT | `1` (Palencia) |
| *(fijo)* | `is_active` | BOOLEAN | `true` |

---

## 5. Decisiones Pendientes para el Administrador

1. **Ampliación de categorías en `venues`**:
   - Actualmente `venues.category` admite: `'general' | 'bar_musical' | 'disco_bar' | 'bar' | 'sala_conciertos' | 'pub' | 'discoteca' | 'teatro' | 'cine'`.
   - Varios candidatos son restaurantes de gastronomía o tapas (`La Parrilla de Don Jamón`, `La Traserilla`, `D'Candela`, `La Vieja Bruselas`). Se debe decidir si incorporar `'restaurante'` como valor admisible en una futura migración o tipificarlos como `'bar'` / `'general'`.
2. **Entidades con proximidad o marca compartida**:
   - CAND-05 (`La Parrilla de Don Jamón`, Pl. Mayor 14) y CAND-07 (`Restaurante Don Jamón`, Pl. Mayor). Decidir si se incorporan ambos como locales independientes o si comparten la misma unidad organizativa.
   - CAND-11 (`Debla`, Pl. Mayor 15) y CAND-17 (`La Cuchillería`, Pl. Mayor 15). Comparten portal; validar si son dos locales diferenciados dentro del mismo edificio.
3. **Tratamiento del Hotel Castilla Vieja (CAND-06)**:
   - Ya censado en `qr_sources` como alojamiento. Confirmar que no debe darse de alta en `venues` a menos que se desee programar eventos culturales en sus salones.

---

## 6. Archivos Generados

- `docs/import-review/2026-10-17-palencia-apify/candidatos_revision.csv`
- `docs/import-review/2026-10-17-palencia-apify/candidatos_normalizados.json`
- `docs/import-review/2026-10-17-palencia-apify/resumen_analisis.md`
