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
