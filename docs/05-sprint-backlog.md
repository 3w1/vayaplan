# VayaPlan — Roadmap Técnico y Sprint Backlog

**Versión:** 1.0  
**Duración del piloto:** 8 semanas  
**Ciudad:** Palencia  
**Fecha:** 14 de octubre de 2026

---

## 1. Objetivo del sprint

Lanzar una PWA funcional para Palencia con:

- Agenda fiable de noche/tardeo y cultura/cine.
- Home sin fricción.
- Fichas de evento normalizadas.
- Panel de curación.
- Canal de WhatsApp.
- QR en alojamientos.
- Primeras campañas promocionadas.
- Métricas de validación.

---

## 2. Semana 1 — Fundamentos

### Tareas

| Tarea | Criterio de aceptación |
|---|---|
| Crear repositorio y estructura monorepo | Estructura `apps/`, `packages/`, `infra/`, `docs/` creada |
| Configurar Docker Compose | API, web, base de datos y Caddy arrancan localmente |
| Crear esquema PostgreSQL | Todas las tablas del modelo de datos se crean sin errores |
| Crear migraciones iniciales | Migraciones reproducibles desde cero |
| Implementar modelo `cities` | Palencia creada con slug `palencia` |
| Implementar modelo `venues` | Se pueden crear locales con ciudad, dirección y coordenadas |
| Implementar modelo `events` | Se pueden crear eventos con fecha, hora y estado |
| Implementar modelo `recurrences` | Se pueden crear recurrencias semanales |
| Implementar modelo `places` | Se pueden crear lugares permanentes |
| Configurar Caddy | HTTPS local o dominio de pruebas funcionando |

### Definition of Done

- Migraciones ejecutables desde cero.
- Datos de prueba creados.
- API responde a endpoints básicos.
- Tests mínimos de modelo y API.

---

## 3. Semana 2 — MVP web y panel

### Tareas

| Tarea | Criterio de aceptación |
|---|---|
| Crear home PWA | Home carga sin registro y muestra contenido por defecto |
| Implementar selector de ciudad | `/palencia` funciona |
| Implementar vista Hoy | Muestra eventos del día |
| Implementar vista Fin de semana | Muestra viernes, sábado y domingo |
| Implementar calendario | Permite consultar fechas futuras |
| Implementar ficha de evento | Muestra todos los campos obligatorios |
| Implementar botones de acción | Maps, reserva, entradas y WhatsApp según disponibilidad |
| Implementar ficha de lugar | Muestra horario, ubicación y eventos relacionados |
| Implementar panel de curación | Permite crear, editar, publicar y cancelar eventos |
| Implementar métricas básicas | Impresiones y clics se registran |
| Cargar primeros 15–20 eventos | Eventos reales verificados del próximo fin de semana |

### Definition of Done

- Web usable en móvil real.
- Carga inferior a 1 segundo en 4G.
- Sin eventos duplicados visibles.
- Sin errores de fecha.
- Agenda del próximo fin de semana completa.

---

## 4. Semana 3 — WhatsApp y distribución

### Tareas

| Tarea | Criterio de aceptación |
|---|---|
| Crear WhatsApp Business | Número operativo y mensaje de bienvenida |
| Crear plantillas de recepción | Plantilla de cartel, texto y enlace |
| Crear flujo de borradores | Evento recibido se registra como `tentative` |
| Crear canal semanal | Canal creado y primer mensaje planificado |
| Crear plantilla de mensaje semanal | Formato breve con 5–8 planes y enlace |
| Crear QR para alojamientos | QR con parámetro de origen `qr_hotel` |
| Contactar 10 alojamientos | Al menos 5 aceptan colocar QR |
| Registrar escaneos | Cada escaneo queda asociado a su origen |

### Definition of Done

- Un local puede enviar un evento por WhatsApp.
- El operador puede publicarlo en menos de 2 minutos.
- El canal publica su primer resumen semanal.
- Los QR están instalados y miden escaneos.

---

## 5. Semana 4 — Calidad y recurrencias

### Tareas

| Tarea | Criterio de aceptación |
|---|---|
| Implementar deduplicación | Eventos repetidos se detectan o envían a revisión |
| Implementar excepciones de recurrencias | Se pueden cancelar o modificar recurrencias por fecha |
| Implementar caducidad automática | Eventos pasados pasan a `outdated` o `archived` |
| Implementar cancelaciones visibles | Cancelación se muestra con etiqueta roja |
| Implementar búsqueda básica | Búsqueda por título, local o categoría |
| Revisar agenda semanal | Cine, teatro y eventos de locales verificados |
| Medir horas de curación | Registro semanal de tiempo por evento |

### Definition of Done

- No hay eventos duplicados visibles.
- No hay recurrencias incorrectas.
- Los eventos pasados no aparecen como activos.
- El tiempo de curación está medido.

---

## 6. Semana 5 — Primera monetización

### Tareas

| Tarea | Criterio de aceptación |
|---|---|
| Implementar modelo `promotions` | Campaña creada con evento, fechas y precio |
| Implementar tarjeta promocionada | Tarjeta ampliada en primera posición |
| Implementar etiqueta “Promocionado” | Etiqueta visible y diferenciada de “Recomendado” |
| Implementar límite de escasez | Máximo 1 por día y 2 por fin de semana |
| Implementar informe de campaña | Informe con impresiones y clics |
| Ofrecer prueba a 3 locales | Al menos 1 campaña vendida a 15 € |
| Enviar primer informe | Informe enviado el lunes siguiente |

### Definition of Done

- Una campaña promocionada está activa.
- El evento aparece primero y etiquetado correctamente.
- El informe se entrega al local.
- No hay más de un promocionado por día.

---

## 7. Semana 6 — Optimización

### Tareas

| Tarea | Criterio de aceptación |
|---|---|
| Analizar tráfico y retención | Informe semanal de usuarios y eventos consultados |
| Analizar escaneos QR | Identificar alojamientos que generan tráfico |
| Mejorar plantillas de WhatsApp | Reducir tiempo de curación |
| Mejorar selección editorial | Criterios claros y trazables |
| Preparar paquete de fecha señalada | Plantilla comercial para Halloween, puente o festivo |
| Preparar argumentario de 19 € | Mensaje breve, claro y medible |
| Revisar errores de datos | Menos del 5% de errores materiales |

### Definition of Done

- Existe un informe semanal de producto.
- Existe una plantilla comercial lista.
- Los errores de datos están por debajo del objetivo.
- El proceso de curación está documentado.

---

## 8. Semana 7 — Validación comercial

### Tareas

| Tarea | Criterio de aceptación |
|---|---|
| Vender promocionado a 19 € | Al menos 2 campañas vendidas |
| Contactar alojamientos adicionales | 10–20 QR activos |
| Medir retorno de usuarios | Identificar usuarios recurrentes |
| Medir conversión de campañas | Impresiones, clics y acciones registradas |
| Preparar informe de validación | Documento con datos reales del piloto |
| Revisar coste operativo | Horas, herramientas, servidor y coste total |

### Definition of Done

- Hay al menos 2 clientes que pagan precio ordinario.
- Las métricas están disponibles.
- El coste real del piloto está calculado.
- Existe un informe de decisión para semana 8.

---

## 9. Semana 8 — Decisión

### Tareas

| Tarea | Criterio de aceptación |
|---|---|
| Analizar retención | Usuarios que vuelven en semanas distintas |
| Analizar renovaciones | Clientes que renuevan campaña |
| Analizar operativa | Horas semanales y tiempo por evento |
| Analizar calidad | Errores, duplicados y cancelaciones |
| Decidir siguiente paso | Continuar, pivotar o cerrar |
| Preparar expansión condicional | Solo si Palencia valida producto y negocio |

### Criterios de decisión

| Resultado | Decisión |
|---|---|
| Retención sostenida y renovaciones | Preparar segunda ciudad |
| Usuarios recurrentes, pero sin pago | Pivotar monetización |
| Mantenimiento insostenible | Reducir alcance o cerrar |
| Datos poco fiables | Mejorar curación antes de crecer |

---

## 10. Plan de pruebas previas al lanzamiento

### Pruebas funcionales

- Home carga sin registro.
- Selector de ciudad funciona.
- Vista hoy, finde y calendario funcionan.
- Ficha de evento muestra todos los campos.
- Botones de acción funcionan.
- Recurrencias aparecen correctamente.
- Lugares permanentes aparecen correctamente.
- Cancelaciones se muestran.
- Panel de curación permite publicar y editar.
- Métricas se registran.

### Pruebas de datos

- No hay eventos duplicados.
- No hay eventos con fecha incorrecta.
- No hay eventos pasados visibles.
- No hay recurrencias canceladas visibles.
- Las imágenes cargan correctamente.
- Los enlaces externos funcionan.

### Pruebas de dispositivo

- iPhone Safari.
- Android Chrome.
- Conexión 4G.
- Pantalla pequeña.
- Modo claro y oscuro.
- Compartir evento por WhatsApp.

### Pruebas de producción

- SSL activo.
- Backup diario.
- Logs accesibles.
- Monitorización de uptime.
- Redirecciones correctas.
- Open Graph correcto al compartir.
