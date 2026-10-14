# VayaPlan — PRD y Especificación Funcional del MVP

**Producto:** VayaPlan  
**Piloto:** Palencia  
**Versión:** 1.0  
**Fecha:** 14 de octubre de 2026  
**Estado:** Aprobado para desarrollo

---

## 1. Objetivo del producto

VayaPlan es una **capa de decisión rápida para el ocio local**. Su objetivo es responder en menos de 30 segundos a la pregunta:

> **¿Qué hacemos hoy o este fin de semana en Palencia?**

No es un agregador exhaustivo de carteles ni un directorio de negocios. Es una agenda fiable, rápida y útil que concentra información dispersa y ayuda al usuario a decidir.

---

## 2. Problema

En ciudades medianas y pequeñas, la oferta de ocio está fragmentada:

- Carteles físicos en cristaleras.
- Historias efímeras de Instagram.
- Publicaciones de Facebook.
- Webs municipales poco actualizadas.
- Canales de WhatsApp y Telegram dispersos.
- Información incompleta, ambigua o desactualizada.

El usuario pierde tiempo revisando múltiples fuentes y, aun así, puede no enterarse de un plan.

---

## 3. Propuesta de valor

> **Encuentra qué hacer hoy, esta noche o este fin de semana en Palencia, sin revisar veinte perfiles.**

VayaPlan ofrece:

- Agenda fiable por día y franja horaria.
- Filtros rápidos por intención: ahora, esta noche, tardeo, cine/cultura.
- Fichas normalizadas con horario, lugar, precio, mapa y acciones.
- Información verificada y trazable.
- Contenido permanente para días con pocos eventos.
- Vista de planificación para grupos y visitantes.

---

## 4. Usuarios objetivo

| Usuario | Necesidad principal |
|---|---|
| Residente local | Saber qué hay hoy o este finde |
| Grupo de amigos | Planificar una salida con antelación |
| Pareja | Encontrar un plan tranquilo, cultural o gastronómico |
| Familia | Encontrar actividades adecuadas en fases posteriores |
| Turista | Consultar qué hacer durante su estancia |
| Local o promotor | Publicar y promocionar eventos |

---

## 5. Alcance del MVP

### 5.1 Ciudad piloto

- Palencia.
- URL principal: `vayaplan.com/palencia`.
- Arquitectura preparada para añadir ciudades posteriormente.

### 5.2 Verticales incluidas

| Vertical | Contenido |
|---|---|
| Noche y tardeo | Conciertos, directos, DJs, monólogos, copas y tardeo |
| Cultura y cine | Cine, teatro, exposiciones, auditorios y actividades culturales |

### 5.3 Tipos de contenido

| Tipo | Descripción | Ejemplo |
|---|---|---|
| Evento puntual | Tiene fecha y hora concretas | Concierto el viernes a las 22:30 |
| Recurrencia | Se repite un día de la semana | Jam session cada jueves |
| Lugar o plan permanente | Disponible de forma continua | Cine, exposición, terraza |

---

## 6. Casos de uso prioritarios

### Caso 1: usuario que decide ahora

1. El usuario abre VayaPlan un viernes a las 20:00.
2. La home muestra automáticamente “Esta noche”.
3. Ve una selección del día y la agenda ordenada por hora.
4. Abre una ficha y pulsa “Cómo llegar” o “Reservar”.

**Resultado esperado:** decisión en menos de 30 segundos.

### Caso 2: grupo que planifica el fin de semana

1. Un usuario abre VayaPlan el martes.
2. Selecciona “Este fin de semana” o abre el calendario.
3. Consulta viernes, sábado y domingo.
4. Comparte un evento por WhatsApp.

**Resultado esperado:** puede planificar sin esperar al viernes.

### Caso 3: visitante que llega a Palencia

1. Un turista escanea un QR en su hotel o apartamento.
2. Accede a la agenda de Palencia filtrada por su estancia.
3. Consulta cine, cultura, música y planes disponibles.
4. Abre el mapa o contacta con el local.

**Resultado esperado:** encuentra planes relevantes sin conocer la ciudad.

### Caso 4: local envía un evento

1. El hostelero envía un cartel o texto por WhatsApp.
2. El operador crea o revisa el borrador.
3. Valida fecha, hora, local, precio y categoría.
4. Publica el evento.

**Resultado esperado:** evento visible en la agenda con fuente y fecha de verificación.

### Caso 5: local promociona un evento

1. El local solicita un destacado.
2. VayaPlan activa la campaña para una fecha concreta.
3. El evento aparece en primera posición, etiquetado como “Promocionado”.
4. El lunes siguiente recibe un informe de métricas.

**Resultado esperado:** visibilidad prioritaria medible.

---

## 7. Funcionalidades incluidas

### 7.1 Home

- Selector de ciudad.
- Selector de fecha: hoy, fin de semana, próximos días y calendario.
- Chips de acceso rápido.
- Selección del día: recomendado o promocionado.
- Agenda cronológica.
- Recurrencias del día.
- Lugares y planes permanentes.
- Acceso ligero para visitantes.

### 7.2 Agenda

- Vista por día.
- Vista por fin de semana.
- Vista de calendario.
- Ordenación cronológica.
- Filtros básicos por categoría y precio.
- Estados visibles: confirmado, pendiente, cancelado.

### 7.3 Ficha de evento

- Título.
- Descripción breve.
- Artista o temática.
- Local.
- Dirección y mapa.
- Fecha y hora reales.
- Fecha editorial para madrugada.
- Precio o entrada libre.
- Estado de verificación.
- Fuente y última verificación.
- Botones de acción: mapa, reserva, entradas, WhatsApp o web.

### 7.4 Ficha de lugar

- Nombre.
- Categoría.
- Descripción breve.
- Dirección y mapa.
- Horario.
- Precio orientativo.
- Eventos relacionados.
- Estado de verificación.

### 7.5 Recurrencias

- Actividades semanales.
- Excepciones por fecha.
- Cancelaciones o cambios puntuales.
- Etiqueta “Cada [día]”.

### 7.6 Panel de curación

- Crear, editar y publicar eventos.
- Aprobar o descartar borradores.
- Marcar duplicados.
- Cancelar eventos.
- Gestionar recurrencias y excepciones.
- Ver métricas básicas.

### 7.7 Promociones

- Crear campaña para un evento.
- Definir fecha de inicio y fin.
- Aplicar límite de un promocionado por día.
- Etiquetar como “Promocionado”.
- Registrar métricas.
- Generar informe posterior.

### 7.8 Captación turística

- QR por alojamiento.
- URL con parámetro de origen.
- Registro de escaneos.
- Acceso a la agenda por fechas.

---

## 8. Funcionalidades excluidas del MVP

Las siguientes funcionalidades quedan fuera del alcance:

- Registro obligatorio de usuarios.
- Login social.
- Perfiles de usuario.
- Comentarios y valoraciones.
- Chat entre usuarios.
- Aplicación nativa.
- Compra de entradas dentro de VayaPlan.
- Sistema propio de reservas.
- Pagos dentro de la plataforma para usuarios finales.
- Notificaciones push complejas.
- Deporte y actividades al aire libre.
- Actividades infantiles y familiares.
- Rutas turísticas complejas.
- Directorio general de restaurantes.
- Cursos, asociaciones y comunidad.
- Venta de insights.
- Bonos regalo o gift cards.
- Patrocinios de marcas.
- Expansión a otras ciudades.

---

## 9. Reglas de contenido

### 9.1 Fiabilidad

- Ningún evento se publica sin local, fecha y hora.
- Los eventos sin confirmación se marcan como `tentative`.
- Los eventos cancelados se muestran brevemente con etiqueta roja.
- Los eventos caducados pasan a `outdated` o `archived`.
- Cada ficha muestra la fecha de última verificación.

### 9.2 Madrugada

Un evento a las 01:30 del sábado se almacena con su timestamp real, pero se clasifica editorialmente como **viernes noche**.

### 9.3 Duplicados

Un evento puede llegar por WhatsApp, web, scraper o revisión manual.

Reglas:

- Comparar local, fecha, hora aproximada, título y similitud de imagen.
- Si hay duda, enviar a revisión.
- No fusionar automáticamente sin confirmación.
- Marcar duplicados como `duplicate`.

### 9.4 Días con poca oferta

Si un día tiene pocos eventos, la app muestra recurrencias y lugares etiquetados como:

- “Cada [día]”.
- “Siempre disponible”.

Nunca se presentan como eventos puntuales.

---

## 10. Monetización del MVP

### 10.1 Publicación base

Gratuita para locales, promotores y espacios culturales.

Incluye:

- Ficha básica.
- Evento en agenda.
- Mapa y contacto.
- Corrección o cancelación.

### 10.2 Evento promocionado

**Precio de validación:** 19 € por evento.  
**Precio de prueba:** 15 € durante las semanas 5 y 6.

Incluye:

1. Primera posición en la agenda del día.
2. Tarjeta ampliada con imagen.
3. Mención prioritaria en el canal semanal de WhatsApp.
4. Informe posterior con métricas.

### 10.3 Límites

- Máximo 1 promocionado por día.
- Máximo 2 promocionados por fin de semana.
- Máximo 1 promocionado por categoría y día.
- Etiqueta visible: “Promocionado”.
- Nunca mezclar “Promocionado” con “Recomendado”.

### 10.4 Cancelaciones

Si el evento promocionado se cancela:

- Se reprograma la campaña.
- O se devuelve el importe.
- Nunca se conserva el pago por un evento cancelado.

---

## 11. Métricas de éxito

### Producto

- Usuarios únicos semanales.
- Usuarios recurrentes.
- Eventos consultados por sesión.
- Clics en mapa, reserva, entradas o contacto.
- Escaneos de QR.
- Tiempo de carga.
- Errores técnicos.

### Calidad

- Porcentaje de eventos con error material.
- Cancelaciones detectadas tarde.
- Eventos duplicados.
- Tiempo medio de curación por evento.
- Horas semanales de mantenimiento.

### Comercial

- Campañas vendidas.
- Ingresos por campaña.
- Clientes que renuevan.
- Ingresos recurrentes mensuales.
- Beneficio real tras imputar horas de trabajo.

### Fórmula de beneficio real

```text
Beneficio real =
  Ingresos netos
  - Costes externos
  - (Horas dedicadas × coste hora)
```

---

## 12. Criterios de éxito del piloto

| Período | Objetivo |
|---|---|
| Semanas 1–2 | 15–20 eventos verificados y web operativa |
| Semanas 3–4 | 100–200 usuarios únicos semanales y primeros usuarios recurrentes |
| Semanas 5–6 | 1–3 campañas de prueba vendidas y primer informe entregado |
| Semanas 7–8 | Al menos 2 locales que pagan precio ordinario y renuevan |

---

## 13. Fuera de alcance: decisiones cerradas

1. No habrá login obligatorio.
2. No habrá app nativa en el MVP.
3. No habrá ticketing propio.
4. No habrá pagos de usuario final.
5. No habrá venta de datos personales.
6. No habrá expansión multiciudad hasta validar Palencia.
7. No habrá promesas de aforo o asistencia garantizada.
8. No se confundirá un clic con un cliente real.
