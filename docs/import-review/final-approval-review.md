# Revisión Final de Candidatos para Aprobación de Importación

**Fecha de evaluación**: 2026-10-17  
**Lote evaluado**: `f2e49699-3af9-4a1b-8a0e-177185d212b4`  
**Dataset fuente**: `docs/dataset_google-maps-scraper_2026-10-17_16-10-03-342.json` (SHA-256: `87ecab79af5d988e6f557930d59376d9195800f8b842882268b1021a7f74533e`)  
**Distribución del lote**: **15 POSIBLE_ALTA**, **2 FUERA_DE_AMBITO**, **0 YA_EXISTENTE**  
**Garantía de control**: `approved: false` en los 17 candidatos (ningún candidato pre-aprobado en este documento).

---

## 1. Tabla de Decisión Final

| ID | Nombre Propuesto | Categoría | Dirección | Teléfono / Web | Recomendación | Motivo de Recomendación |
|---|---|---|---|---|---|---|
| **CAND-01** | Restaurante y Cervecería la Vieja Bruselas | `general` | Pl. de los Dominicos, 3 | Tel: 979 70 28 17 / Web | **APROBAR** | Datos completos, 7 días de horario, sin conflicto censal. |
| **CAND-03** | TABERNA LA HERRADA | `bar` | Av. de los Vacceos, 9 | IG: @tabernalaherradapalencia | **APROBAR** | Local de hostelería activo; canal Instagram verificado. |
| **CAND-04** | La Clásica | `general` | C. Mayor Principal, 1 | Tel: 979 61 24 11 / Web | **APROBAR** | Filas duplicadas absorbidas con éxito; 7 días de horario. |
| **CAND-05** | La Parrilla de Don Jamón | `general` | Pl. Mayor, 14 | Tel: 979 74 12 12 / Web | **APROBAR** | Confirmado por decisión humana como local independiente. |
| **CAND-07** | Restaurante Don Jamón | `bar` | Pl. Mayor | Tel: 979 70 22 70 / Web | **APROBAR** | Confirmado por decisión humana como local independiente. |
| **CAND-08** | Bar javi | `bar` | C. Mayor Antigua, 32 | Tel: 607 43 03 56 | **APROBAR** | Bar tradicional verificado; se sugiere capitalizar "Bar Javi". |
| **CAND-09** | La Barra de Villoldo | `bar` | Pl. Rinconada San Miguel, 2 | Tel: 979 61 02 02 / Web | **APROBAR** | Ficha completa, sin colisiones en el censo. |
| **CAND-10** | Restaurante La Traserilla | `general` | C. Don Sancho, 1 | Tel: 979 74 54 21 / Web | **APROBAR** | Restaurante consolidado con ficha completa. |
| **CAND-11** | Debla | `bar` | Pl. Mayor, 15 | Tel: 979 74 29 27 | **APROBAR** | Confirmado por decisión humana como negocio independiente. |
| **CAND-12** | Restaurante D'Candela | `general` | Pl. Mayor, 10 | Tel: 979 87 28 78 / Web | **APROBAR** | Sin coincidencias previas en censo; datos completos. |
| **CAND-13** | Habana, Cafetería Restaurante en Palencia | `bar` | C. Mayor Principal, 101 | Tel: 979 04 16 24 / Web | **APROBAR** | Activo con web; se sugiere simplificar nombre a "Cafetería Habana". |
| **CAND-14** | Bar Alaska | `bar` | C. Mayor Principal, 26 | Tel: 979 74 28 35 / FB | **APROBAR** | Bar clásico en calle Mayor; teléfono y Facebook capturados. |
| **CAND-15** | La Mejillonera | `bar` | C. los Soldados, 7 | Tel: 979 74 47 68 | **APROBAR** | Local emblemático de tapas; sin colisiones censales. |
| **CAND-16** | DIECINUEVE | `bar` | C. Mayor Principal, 80 | Tel: 979 70 10 22 / Web | **APROBAR** | Ficha completa con web; se sugiere ajustar mayúsculas. |
| **CAND-17** | La Cuchillería | `general` | Pl. Mayor, 15 | Tel: 673 03 22 75 / Web | **APROBAR** | Confirmado por decisión humana como negocio independiente. |
| *CAND-02* | *Taberna Plaza Vieja* | *bar* | *C. España, 21 (Fuengirola)* | *Tel: 951 31 19 04* | **NO APROBAR** | *FUERA_DE_AMBITO: Municipio de Fuengirola (Málaga).* |
| *CAND-06* | *Hotel Castilla Vieja* | *general* | *Av. Casado del Alisal, 26* | *Tel: 979 74 90 44* | **NO APROBAR** | *FUERA_DE_AMBITO: Alojamiento turístico; preservado en qr_sources.* |

---

## 2. Detalle de los 15 Candidatos POSIBLE_ALTA

### 1. CAND-01 — Restaurante y Cervecería la Vieja Bruselas
- **Ubicación**: Pl. de los Dominicos, 3, 34005 Palencia (Zona: `seminario`).
- **Categoría**: `general` (Google: "Restaurante").
- **Contacto y horarios**: Tel `+34 979 70 28 17` (`venues.phone`), web `http://www.restaurantelaviejabruselas.es/`, 7 días con horario registrado.
- **Identificadores**: `placeId: ChIJaVu-i0OwRw0RDWNvzZO0cR0`.
- **Coincidencias con censo**: Ninguna.
- **Riesgos**: Ninguno. Ficha íntegra.
- **Recomendación**: **APROBAR**.

### 2. CAND-03 — TABERNA LA HERRADA
- **Ubicación**: Av. de los Vacceos, 9, 34003 Palencia (Zona: `otros`).
- **Categoría**: `bar` (Google: "Bar de tapas").
- **Contacto y horarios**: Sin teléfono fijo ni web propia. Instagram: `@tabernalaherradapalencia`, 7 días de horario.
- **Identificadores**: `placeId: ChIJxcK6CcqxRw0RCVmwyyKPJqU`.
- **Coincidencias con censo**: Ninguna.
- **Riesgos**: Ausencia de teléfono (campo no obligatorio en `venues`).
- **Recomendación**: **APROBAR**.

### 3. CAND-04 — La Clásica
- **Ubicación**: C. Mayor Principal, 1, 34001 Palencia (Zona: `centro_puebla`).
- **Categoría**: `general` (Google: "Restaurante").
- **Contacto y horarios**: Tel `+34 979 61 24 11`, web `https://www.laclasicapalencia.com/`, 7 días de horario.
- **Identificadores**: `placeId: ChIJPRDzdACxRw0RoGvKB2ecj5U` (Filas 4 y 16 consolidadas).
- **Coincidencias con censo**: Ninguna.
- **Riesgos**: Ninguno.
- **Recomendación**: **APROBAR**.

### 4. CAND-05 — La Parrilla de Don Jamón
- **Ubicación**: Pl. Mayor, 14, 34001 Palencia (Zona: `centro_puebla`).
- **Categoría**: `general` (Google: "Restaurante").
- **Contacto y horarios**: Tel `+34 979 74 12 12`, web `http://www.laparrilladedonjamon.es/`, 7 días de horario.
- **Identificadores**: `placeId: ChIJZVXar0WxRw0RdlhAqZydG2c` (Filas 5 y 13 consolidadas).
- **Coincidencias con censo**: Validación humana resolvió conflicto de marca con CAND-07.
- **Riesgos**: Ninguno pendiente.
- **Recomendación**: **APROBAR** (Decisión humana: local independiente respecto a CAND-07).

### 5. CAND-07 — Restaurante Don Jamón
- **Ubicación**: Pl. Mayor, 34001 Palencia (Zona: `centro_puebla`).
- **Categoría**: `bar` (Google: "Restaurante" / Bar restaurante).
- **Contacto y horarios**: Tel `+34 979 70 22 70`, web `http://www.restaurantedonjamon.com/`, 7 días de horario.
- **Identificadores**: `placeId: ChIJ0RPiu0ewRw0RsDiuTerqBKc` (Filas 7 y 14 consolidadas).
- **Coincidencias con censo**: Validación humana resolvió conflicto de marca con CAND-05.
- **Riesgos**: Dirección sin número de portal en Maps; coordenadas geográficas precisas.
- **Recomendación**: **APROBAR** (Decisión humana: local independiente respecto a CAND-05).

### 6. CAND-08 — Bar javi
- **Ubicación**: C. Mayor Antigua, 32, 34005 Palencia (Zona: `seminario`).
- **Categoría**: `bar` (Google: "Restaurante" / Bar restaurante).
- **Contacto y horarios**: Tel `+34 607 43 03 56`, sin web, 7 días de horario.
- **Identificadores**: `placeId: ChIJl0cuDEGwRw0RzAoRdx1g1Jc`.
- **Coincidencias con censo**: Ninguna.
- **Riesgos**: Nombre en minúsculas en fuente ("Bar javi").
- **Recomendación**: **APROBAR** (sugiriendo presentación como "Bar Javi").

### 7. CAND-09 — La Barra de Villoldo
- **Ubicación**: Pl. la Rinconada de San Miguel, 2, 34005 Palencia (Zona: `otros`).
- **Categoría**: `bar` (Google: "Bar restaurante").
- **Contacto y horarios**: Tel `+34 979 61 02 02`, web `http://labarradevilloldo.com/`, 7 días de horario.
- **Identificadores**: `placeId: ChIJw_EdhDiwRw0R8N3S6Fv2Yn0`.
- **Coincidencias con censo**: Ninguna.
- **Riesgos**: Ninguno.
- **Recomendación**: **APROBAR**.

### 8. CAND-10 — Restaurante La Traserilla
- **Ubicación**: C. Don Sancho, 1, 34001 Palencia (Zona: `centro_puebla`).
- **Categoría**: `general` (Google: "Restaurante de cocina española").
- **Contacto y horarios**: Tel `+34 979 74 54 21`, web `http://www.latraserilla.es/`, 7 días de horario.
- **Identificadores**: `placeId: ChIJPXkrE0ewRw0RRJNYaKx4bCQ`.
- **Coincidencias con censo**: Ninguna.
- **Riesgos**: Ninguno.
- **Recomendación**: **APROBAR**.

### 9. CAND-11 — Debla
- **Ubicación**: Pl. Mayor, 15, 34001 Palencia (Zona: `centro_puebla`).
- **Categoría**: `bar` (Google: "Bar").
- **Contacto y horarios**: Tel `+34 979 74 29 27`, sin web, 1 día de horario registrado.
- **Identificadores**: `placeId: ChIJoxA_z0ewRw0Rl9JuNSb1qxM`.
- **Coincidencias con censo**: Portal compartido con CAND-17 resuelto por decisión humana como negocio activo e independiente.
- **Riesgos**: Ninguno pendiente.
- **Recomendación**: **APROBAR** (Decisión humana: negocio activo e independiente de CAND-17).

### 10. CAND-12 — Restaurante D'Candela
- **Ubicación**: Pl. Mayor, 10, 34001 Palencia (Zona: `centro_puebla`).
- **Categoría**: `general` (Google: "Restaurante").
- **Contacto y horarios**: Tel `+34 979 87 28 78`, web `https://decandelarestaurante.com/`, 1 día de horario registrado.
- **Identificadores**: `placeId: ChIJg39ojCSxRw0RPuTihIE3drU`.
- **Coincidencias con censo**: Ninguna.
- **Riesgos**: Ninguno.
- **Recomendación**: **APROBAR**.

### 11. CAND-13 — Habana, Cafetería Restaurante en Palencia
- **Ubicación**: C. Mayor Principal, 101, 34001 Palencia (Zona: `centro_puebla`).
- **Categoría**: `bar` (Google: "Bar" / Cafetería).
- **Contacto y horarios**: Tel `+34 979 04 16 24`, web `https://habanacafeteria.com/`, 1 día de horario registrado.
- **Identificadores**: `placeId: ChIJc1oAmQmxRw0RvUgJkeKZTqE`.
- **Coincidencias con censo**: Ninguna.
- **Riesgos**: Título original con coletilla SEO.
- **Recomendación**: **APROBAR** (sugiriendo presentación como "Cafetería Habana").

### 12. CAND-14 — Bar Alaska
- **Ubicación**: C. Mayor Principal, 26, 34001 Palencia (Zona: `centro_puebla`).
- **Categoría**: `bar` (Google: "Bar").
- **Contacto y horarios**: Tel `+34 979 74 28 35`, Facebook `https://www.facebook.com/AlaskaPalencia/`, 1 día de horario registrado.
- **Identificadores**: `placeId: ChIJl8APWUawRw0RwP9_EtNKUaQ`.
- **Coincidencias con censo**: Ninguna.
- **Riesgos**: Ninguno.
- **Recomendación**: **APROBAR**.

### 13. CAND-15 — La Mejillonera
- **Ubicación**: C. los Soldados, 7, 34001 Palencia (Zona: `centro_puebla`).
- **Categoría**: `bar` (Google: "Bar").
- **Contacto y horarios**: Tel `+34 979 74 47 68`, sin web, 1 día de horario registrado.
- **Identificadores**: `placeId: ChIJyb7ka0awRw0RVHYqQbeonRY`.
- **Coincidencias con censo**: Ninguna.
- **Riesgos**: Ninguno.
- **Recomendación**: **APROBAR**.

### 14. CAND-16 — DIECINUEVE
- **Ubicación**: C. Mayor Principal, 80, 34001 Palencia (Zona: `centro_puebla`).
- **Categoría**: `bar` (Google: "Restaurante" / Bar restaurante).
- **Contacto y horarios**: Tel `+34 979 70 10 22`, web `https://www.muchodiecinueve.com/`, 1 día de horario registrado.
- **Identificadores**: `placeId: ChIJg79yMESxRw0RypSCPtTvNPQ`.
- **Coincidencias con censo**: Ninguna.
- **Riesgos**: Título en mayúsculas ("DIECINUEVE").
- **Recomendación**: **APROBAR** (sugiriendo presentación como "Diecinueve").

### 15. CAND-17 — La Cuchillería
- **Ubicación**: Pl. Mayor, 15, 34001 Palencia (Zona: `centro_puebla`).
- **Categoría**: `general` (Google: "Restaurante").
- **Contacto y horarios**: Tel `+34 673 03 22 75`, web `https://lacuchilleriapalencia.com/`, 1 día de horario registrado.
- **Identificadores**: `placeId: ChIJCVZbNACxRw0RxW5Jjg55UH8`.
- **Coincidencias con censo**: Portal compartido con CAND-11 resuelto por decisión humana como negocio activo e independiente.
- **Riesgos**: Ninguno pendiente.
- **Recomendación**: **APROBAR** (Decisión humana: negocio activo e independiente de CAND-11).
