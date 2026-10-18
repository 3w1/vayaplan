# Informe de Revisión Humana del Manifiesto de Importación

**Fecha de evaluación**: 2026-10-17  
**Lote evaluado**: `f2e49699-3af9-4a1b-8a0e-177185d212b4`  
**Dataset fuente**: `docs/dataset_google-maps-scraper_2026-10-17_16-10-03-342.json` (SHA-256: `87ecab79af5d988e6f557930d59376d9195800f8b842882268b1021a7f74533e`)  
**Estado de aprobación**: `approved: false` en los 17 candidatos (bloqueado para persistencia hasta decisión expresa).

---

## 1. Tabla Resumen de Recomendaciones

| ID | Nombre Propuesto | Categoría | Dirección | Clasificación Actual | Recomendación Técnica | Estado de Decisión |
|---|---|---|---|---|---|---|
| **CAND-01** | Restaurante y Cervecería la Vieja Bruselas | `general` | Pl. de los Dominicos, 3 | `POSIBLE_ALTA` | **APROBAR** | Alta recomendada |
| **CAND-02** | Taberna Plaza Vieja | `bar` | C. España, 21 (Fuengirola) | `FUERA_DE_AMBITO` | **RECHAZAR** | Descartar (otra ciudad) |
| **CAND-03** | TABERNA LA HERRADA | `bar` | Av. de los Vacceos, 9 | `POSIBLE_ALTA` | **APROBAR** | Alta recomendada (con Instagram) |
| **CAND-04** | La Clásica | `general` | C. Mayor Principal, 1 | `POSIBLE_ALTA` | **APROBAR** | Alta recomendada |
| **CAND-05** | La Parrilla de Don Jamón | `general` | Pl. Mayor, 14 | `REVISAR_COINCIDENCIA` | **SOLICITAR MÁS DATOS** | `PENDIENTE_HUMANO` |
| **CAND-06** | Hotel Castilla Vieja | `general` | Av. Casado del Alisal, 26 | `FUERA_DE_AMBITO` | **RECHAZAR** | Descartar (alojamiento / qr_source) |
| **CAND-07** | Restaurante Don Jamón | `bar` | Pl. Mayor | `REVISAR_COINCIDENCIA` | **SOLICITAR MÁS DATOS** | `PENDIENTE_HUMANO` |
| **CAND-08** | Bar javi | `bar` | C. Mayor Antigua, 32 | `POSIBLE_ALTA` | **APROBAR** | Alta recomendada (capitalizar "Javi") |
| **CAND-09** | La Barra de Villoldo | `bar` | Pl. la Rinconada de San Miguel, 2 | `POSIBLE_ALTA` | **APROBAR** | Alta recomendada |
| **CAND-10** | Restaurante La Traserilla | `general` | C. Don Sancho, 1 | `POSIBLE_ALTA` | **APROBAR** | Alta recomendada |
| **CAND-11** | Debla | `bar` | Pl. Mayor, 15 | `REVISAR_COINCIDENCIA` | **SOLICITAR MÁS DATOS** | `PENDIENTE_HUMANO` |
| **CAND-12** | Restaurante D'Candela | `general` | Pl. Mayor, 10 | `POSIBLE_ALTA` | **APROBAR** | Alta recomendada |
| **CAND-13** | Habana, Cafetería Restaurante en Palencia | `bar` | C. Mayor Principal, 101 | `POSIBLE_ALTA` | **APROBAR** | Alta recomendada (normalizar nombre) |
| **CAND-14** | Bar Alaska | `bar` | C. Mayor Principal, 26 | `POSIBLE_ALTA` | **APROBAR** | Alta recomendada |
| **CAND-15** | La Mejillonera | `bar` | C. los Soldados, 7 | `POSIBLE_ALTA` | **APROBAR** | Alta recomendada |
| **CAND-16** | DIECINUEVE | `bar` | C. Mayor Principal, 80 | `POSIBLE_ALTA` | **APROBAR** | Alta recomendada (ajustar mayúsculas) |
| **CAND-17** | La Cuchillería | `general` | Pl. Mayor, 15 | `REVISAR_COINCIDENCIA` | **SOLICITAR MÁS DATOS** | `PENDIENTE_HUMANO` |

---

## 2. Análisis Detallado de los Casos Críticos

### A. CAND-11 (Debla) vs CAND-17 (La Cuchillería) — Coincidencia física en Pl. Mayor 15
- **Evidencia técnica**:
  - Ambos candidatos figuran con la misma dirección postal: `Pl. Mayor, 15, 34001 Palencia`.
  - **CAND-11**: `placeId: ChIJoxA_z0ewRw0Rl9JuNSb1qxM`, teléfono `979 74 29 27`, sin web, categoría bar.
  - **CAND-17**: `placeId: ChIJCVZbNACxRw0RxW5Jjg55UH8`, teléfono `673 03 22 75`, web `https://lacuchilleriapalencia.com/`, categoría restaurante.
- **Diagnóstico**:
  - Se trata de una probable **sucesión o sustitución de negocio**. "La Cuchillería" es un restaurante inaugurado en los últimos años en el emplazamiento que históricamente ocupaba el bar "Debla". Google Maps conserva con frecuencia la ficha del negocio anterior si no fue reportado formalmente como cerrado.
  - Otra posibilidad residual es que compartan portal en los soportales de la Plaza Mayor como negocios contiguos.
- **Dictamen**: **`PENDIENTE_HUMANO`**. No autorizar la importación simultánea de ambos. Se recomienda comprobar si Debla sigue activo; si cerró, aprobar exclusivamente CAND-17 (La Cuchillería) y descartar CAND-11.

### B. CAND-05 (La Parrilla de Don Jamón) vs CAND-07 (Restaurante Don Jamón) — Misma marca en Plaza Mayor
- **Evidencia técnica**:
  - **CAND-05**: `placeId: ChIJZVXar0WxRw0RdlhAqZydG2c`, `Pl. Mayor, 14`, tel `979 74 12 12`, web `http://www.laparrilladedonjamon.es/`.
  - **CAND-07**: `placeId: ChIJ0RPiu0ewRw0RsDiuTerqBKc`, `Pl. Mayor` (sin número), tel `979 70 22 70`, web `http://www.restaurantedonjamon.com/`.
- **Diagnóstico**:
  - Pertenecen al mismo grupo hostelero en Palencia. Históricamente han operado la zona de restaurante/asador y la zona de bar/tapas/terraza bajo dos rótulos relacionados ("Restaurante Don Jamón" y "La Parrilla de Don Jamón"), con líneas telefónicas y dominios web diferenciados.
- **Dictamen**: **`PENDIENTE_HUMANO`**. Decidir si para VayaPlan deben figurar como **dos locales independientes** (aprobando ambos con sus datos específicos) o **fusionarse en una única ficha censal** representativa de la marca en la Plaza Mayor.

### C. CAND-02 (Taberna Plaza Vieja) y CAND-06 (Hotel Castilla Vieja) — Propuestos FUERA_DE_AMBITO
- **CAND-02**: Ubicado en `C. España, 21, Fuengirola (Málaga)`. Se descargó por coincidencia de la query "Taberna Plaza Vieja Palencia". Queda **RECHAZADO** de forma inequívoca por pertenecer a otra comunidad autónoma.
- **CAND-06**: Hotel Castilla Vieja (`Av. Casado del Alisal, 26`). Coincide con el registro `qr_sources` ID 1. Es un hotel (alojamiento turístico), fuera de la tipología de locales de ocio y hostelería (`venues`). Queda **RECHAZADO** para alta en `venues`, preservando su rol existente como fuente QR.
- **Dictamen**: **`CONFIRMADO_EXCLUSION`**. Ambos deben permanecer con `approved: false` y ser ignorados en la fase `apply`.

---

## 3. Ficha Candidato por Candidato

### CAND-01 — Restaurante y Cervecería la Vieja Bruselas
- **Identificadores**: `placeId: ChIJaVu-i0OwRw0RDWNvzZO0cR0` (Fila 1)
- **Ubicación**: Pl. de los Dominicos, 3, 34005 Palencia (Zona: `seminario`)
- **Categoría**: `general` (Google: "Restaurante")
- **Contacto y horarios**: Tel `+34 979 70 28 17` (`venues.phone`), web `http://www.restaurantelaviejabruselas.es/`, 7 días de horario.
- **Evaluación**: Registro completo y limpio sin colisiones. **Recomendación: APROBAR**.

### CAND-02 — Taberna Plaza Vieja
- **Identificadores**: `placeId: ChIJExpODWvicg0RcrTYrRA54x4` (Fila 2)
- **Ubicación**: Fuengirola, Málaga
- **Evaluación**: Fuera de Palencia. **Recomendación: RECHAZAR**.

### CAND-03 — TABERNA LA HERRADA
- **Identificadores**: `placeId: ChIJxcK6CcqxRw0RCVmwyyKPJqU` (Fila 3)
- **Ubicación**: Av. de los Vacceos, 9, 34003 Palencia (Zona: `otros`)
- **Categoría**: `bar` (Google: "Bar de tapas")
- **Contacto y horarios**: Sin teléfono ni web; Instagram `@tabernalaherradapalencia`, 7 días de horario.
- **Evaluación**: Válido para el censo de bares de Palencia. **Recomendación: APROBAR**.

### CAND-04 — La Clásica
- **Identificadores**: `placeId: ChIJPRDzdACxRw0RoGvKB2ecj5U` (Filas 4, 16 consolidadas)
- **Ubicación**: C. Mayor Principal, 1, 34001 Palencia (Zona: `centro_puebla`)
- **Categoría**: `general` (Google: "Restaurante")
- **Contacto y horarios**: Tel `+34 979 61 24 11`, web `https://www.laclasicapalencia.com/`, 7 días de horario.
- **Evaluación**: Datos ricos consolidados sin conflictos censales. **Recomendación: APROBAR**.

### CAND-05 — La Parrilla de Don Jamón
- **Identificadores**: `placeId: ChIJZVXar0WxRw0RdlhAqZydG2c` (Filas 5, 13 consolidadas)
- **Ubicación**: Pl. Mayor, 14, 34001 Palencia (Zona: `centro_puebla`)
- **Categoría**: `general`
- **Contacto y horarios**: Tel `+34 979 74 12 12`, web `http://www.laparrilladedonjamon.es/`, 7 días de horario.
- **Evaluación**: Ambigüedad con CAND-07. **Recomendación: PENDIENTE_HUMANO**.

### CAND-06 — Hotel Castilla Vieja
- **Identificadores**: `placeId: ChIJ0a5wX0iwRw0R3Ddf9JSy2Jo` (Fila 6)
- **Ubicación**: Av. de Casado del Alisal, 26, 34001 Palencia
- **Evaluación**: Alojamiento registrado en `qr_sources` (ID 1). Fuera de alcance para `venues`. **Recomendación: RECHAZAR**.

### CAND-07 — Restaurante Don Jamón
- **Identificadores**: `placeId: ChIJ0RPiu0ewRw0RsDiuTerqBKc` (Filas 7, 14 consolidadas)
- **Ubicación**: Pl. Mayor, 34001 Palencia (Zona: `centro_puebla`)
- **Categoría**: `bar`
- **Contacto y horarios**: Tel `+34 979 70 22 70`, web `http://www.restaurantedonjamon.com/`, 7 días de horario.
- **Evaluación**: Ambigüedad con CAND-05. **Recomendación: PENDIENTE_HUMANO**.

### CAND-08 — Bar javi
- **Identificadores**: `placeId: ChIJl0cuDEGwRw0RzAoRdx1g1Jc` (Fila 8)
- **Ubicación**: C. Mayor Antigua, 32, 34005 Palencia (Zona: `seminario`)
- **Categoría**: `bar`
- **Contacto y horarios**: Tel `+34 607 43 03 56`, sin web, 7 días de horario.
- **Evaluación**: Válido. Conviene corregir mayúscula a "Bar Javi". **Recomendación: APROBAR**.

### CAND-09 — La Barra de Villoldo
- **Identificadores**: `placeId: ChIJw_EdhDiwRw0R8N3S6Fv2Yn0` (Fila 9)
- **Ubicación**: Pl. la Rinconada de San Miguel, 2, 34005 Palencia (Zona: `otros`)
- **Categoría**: `bar`
- **Contacto y horarios**: Tel `+34 979 61 02 02`, web `http://labarradevilloldo.com/`, 7 días de horario.
- **Evaluación**: Establecimiento reconocido de Palencia. **Recomendación: APROBAR**.

### CAND-10 — Restaurante La Traserilla
- **Identificadores**: `placeId: ChIJPXkrE0ewRw0RRJNYaKx4bCQ` (Fila 10)
- **Ubicación**: C. Don Sancho, 1, 34001 Palencia (Zona: `centro_puebla`)
- **Categoría**: `general`
- **Contacto y horarios**: Tel `+34 979 74 54 21`, web `http://www.latraserilla.es/`, 7 días de horario.
- **Evaluación**: Restaurante tradicional en centro. **Recomendación: APROBAR**.

### CAND-11 — Debla
- **Identificadores**: `placeId: ChIJoxA_z0ewRw0Rl9JuNSb1qxM` (Fila 11)
- **Ubicación**: Pl. Mayor, 15, 34001 Palencia
- **Categoría**: `bar`
- **Contacto y horarios**: Tel `+34 979 74 29 27`, sin web, 1 día de horario.
- **Evaluación**: Ambigüedad física con CAND-17 en el mismo número. **Recomendación: PENDIENTE_HUMANO**.

### CAND-12 — Restaurante D'Candela
- **Identificadores**: `placeId: ChIJg39ojCSxRw0RPuTihIE3drU` (Fila 12)
- **Ubicación**: Pl. Mayor, 10, 34001 Palencia (Zona: `centro_puebla`)
- **Categoría**: `general`
- **Contacto y horarios**: Tel `+34 979 87 28 78`, web `https://decandelarestaurante.com/`, 1 día de horario.
- **Evaluación**: Sin colisiones en el censo. **Recomendación: APROBAR**.

### CAND-13 — Habana, Cafetería Restaurante en Palencia
- **Identificadores**: `placeId: ChIJc1oAmQmxRw0RvUgJkeKZTqE` (Fila 15)
- **Ubicación**: C. Mayor Principal, 101, 34001 Palencia (Zona: `centro_puebla`)
- **Categoría**: `bar`
- **Contacto y horarios**: Tel `+34 979 04 16 24`, web `https://habanacafeteria.com/`, 1 día de horario.
- **Evaluación**: Válido. Conviene acortar el nombre a "Cafetería Habana" para el catálogo. **Recomendación: APROBAR**.

### CAND-14 — Bar Alaska
- **Identificadores**: `placeId: ChIJl8APWUawRw0RwP9_EtNKUaQ` (Fila 17)
- **Ubicación**: C. Mayor Principal, 26, 34001 Palencia (Zona: `centro_puebla`)
- **Categoría**: `bar`
- **Contacto y horarios**: Tel `+34 979 74 28 35`, Facebook `https://www.facebook.com/AlaskaPalencia/`, 1 día de horario.
- **Evaluación**: Clásico bar en calle Mayor. **Recomendación: APROBAR**.

### CAND-15 — La Mejillonera
- **Identificadores**: `placeId: ChIJyb7ka0awRw0RVHYqQbeonRY` (Fila 18)
- **Ubicación**: C. los Soldados, 7, 34001 Palencia (Zona: `centro_puebla`)
- **Categoría**: `bar`
- **Contacto y horarios**: Tel `+34 979 74 47 68`, sin web, 1 día de horario.
- **Evaluación**: Local histórico de tapas en Palencia. **Recomendación: APROBAR**.

### CAND-16 — DIECINUEVE
- **Identificadores**: `placeId: ChIJg79yMESxRw0RypSCPtTvNPQ` (Fila 19)
- **Ubicación**: C. Mayor Principal, 80, 34001 Palencia (Zona: `centro_puebla`)
- **Categoría**: `bar`
- **Contacto y horarios**: Tel `+34 979 70 10 22`, web `https://www.muchodiecinueve.com/`, 1 día de horario.
- **Evaluación**: Válido. Conviene normalizar mayúsculas a "Diecinueve". **Recomendación: APROBAR**.

### CAND-17 — La Cuchillería
- **Identificadores**: `placeId: ChIJCVZbNACxRw0RxW5Jjg55UH8` (Fila 20)
- **Ubicación**: Pl. Mayor, 15, 34001 Palencia (Zona: `centro_puebla`)
- **Categoría**: `general`
- **Contacto y horarios**: Tel `+34 673 03 22 75`, web `https://lacuchilleriapalencia.com/`, 1 día de horario.
- **Evaluación**: Ambigüedad física con CAND-11 en el mismo número. **Recomendación: PENDIENTE_HUMANO**.
