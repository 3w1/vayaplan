# VayaPlan — Playbook Comercial y Métricas de Validación

**Versión:** 1.0  
**Ciudad piloto:** Palencia  
**Fecha:** 14 de octubre de 2026

---

## 1. Objetivo comercial

Validar si VayaPlan puede generar ingresos reales y sostenibles en Palencia.

El objetivo no es conseguir muchos pagos puntuales por simpatía, sino demostrar:

1. Que la agenda genera tráfico recurrente.
2. Que los locales perciben valor.
3. Que algunos clientes pagan y renuevan.
4. Que la operación es sostenible en tiempo y coste.

---

## 2. Productos comerciales del MVP

### 2.1 Publicación base

**Precio:** gratuito.

Incluye:

- Ficha básica del local.
- Evento en la agenda.
- Mapa y datos de contacto.
- Corrección o cancelación.

### 2.2 Evento promocionado

**Precio de validación:** 19 € por evento.  
**Precio de prueba:** 15 € durante las semanas 5 y 6.

Incluye:

1. Primera posición en la agenda del día.
2. Tarjeta ampliada con imagen.
3. Mención prioritaria en el canal semanal de WhatsApp.
4. Informe posterior con métricas.

### 2.3 Límites

- Máximo 1 promocionado por día.
- Máximo 2 promocionados por fin de semana.
- Máximo 1 promocionado por categoría y día.
- Etiqueta visible: “Promocionado”.
- Nunca mezclar “Promocionado” con “Recomendado”.

---

## 3. Argumentario de venta

### Mensaje principal

> “Tu evento seguirá apareciendo en Instagram, pero VayaPlan lo pone delante de gente que está decidiendo qué hacer ese mismo día y todavía no ha elegido local.”

### Oferta breve

> “Por 19 € aseguramos que tu evento sea lo primero que vea la gente el [día] en VayaPlan, con tarjeta destacada, mención en nuestro canal de WhatsApp y un informe con las visitas y clics generados.”

### Escasez real

> “Solo permitimos un evento promocionado por día para no saturar la agenda. Para el [día], el espacio está libre.”

### Comparativa con cartelería física

| Concepto | Cartel físico | VayaPlan |
|---|---|---|
| Coste | Diseño, imprenta y colocación | 19 € todo incluido |
| Audiencia | Quien pasa delante | Personas buscando planes |
| Actualización | Requiere impresión previa | Se activa en minutos |
| Medición | Ninguna | Impresiones y clics |
| Duración | Hasta que se retire o deteriore | Periodo definido |

### Qué no prometer

- No prometer asistencia garantizada.
- No prometer aforo lleno.
- No prometer ventas concretas.
- No confundir clic con cliente.
- No prometer notificaciones garantizadas en WhatsApp.

---

## 4. Proceso de venta

### Paso 1: valor previo

1. Publicar eventos del local de forma gratuita.
2. Compartir la agenda semanal.
3. Etiquetar al local cuando corresponda.
4. Enviar captura o enlace cuando su evento esté publicado.

### Paso 2: demostración

1. Mostrar la ficha de su evento.
2. Mostrar métricas de impresiones y clics.
3. Explicar qué habría mejorado con posición destacada.
4. Proponer una campaña de prueba.

### Paso 3: cierre

1. Ofrecer el paquete de 19 €.
2. Explicar entregables y límite de escasez.
3. Confirmar evento, fecha y acciones disponibles.
4. Activar campaña.
5. Enviar confirmación por WhatsApp.

### Paso 4: renovación

1. Enviar informe el lunes.
2. Proponer la siguiente campaña.
3. Mostrar comparativa con la campaña anterior.
4. Ofrecer paquete para fecha señalada si procede.

---

## 5. Plantillas de WhatsApp

### 5.1 Primer contacto

```text
Hola [Nombre], soy [Tu nombre] de VayaPlan.

Estamos creando la agenda de ocio de Palencia: conciertos, tardeo, cine, teatro y planes para el fin de semana.

Hemos incluido vuestro evento “ [Evento] ” en vayaplan.com/palencia.

Si queréis, podéis enviarnos aquí vuestros próximos carteles y los publicamos gratis.
```

### 5.2 Envío de métricas

```text
Hola [Nombre], así ha rendido vuestro evento “ [Evento] ” en VayaPlan:

• Visualizaciones de la tarjeta: [X]
• Clics en “Cómo llegar”: [X]
• Clics en reserva/entradas/perfil: [X]
• Alcance en nuestro canal: [X]

Estos son datos de interacción, no una garantía de asistencia.

Si queréis asegurar una posición destacada para vuestro próximo evento, podemos activarlo por 19 €.
```

### 5.3 Oferta de fecha señalada

```text
Hola [Nombre], para [Halloween / Nochevieja / San Antolín / puente] vamos a crear un especial de planes en VayaPlan.

Solo permitimos un evento promocionado por categoría para no saturar la agenda.

El paquete incluye:
• Posición prioritaria en el especial.
• Tarjeta destacada.
• Mención en el canal de WhatsApp.
• Informe posterior.

Precio: [59–99 €].

¿Queréis reservar el espacio para vuestro evento?
```

---

## 6. Censo inicial

Crear un CSV con estos campos:

```csv
venue_name,address,latitude,longitude,instagram,website,whatsapp,contact_name,category,event_frequency,status,last_checked_at,notes
```

### Campos de estado

| Estado | Descripción |
|---|---|
| `to_contact` | Pendiente de contactar |
| `contacted` | Contactado |
| `collaborating` | Envía eventos o colabora |
| `inactive` | Sin actividad o sin respuesta |
| `rejected` | No interesado |

### Objetivo inicial

- 20–25 locales nocturnos.
- 3–5 espacios culturales.
- 10 alojamientos con QR.
- 15–20 eventos verificados para el primer fin de semana.

---

## 7. Métricas a registrar

### Producto

| Métrica | Definición |
|---|---|
| Usuarios únicos semanales | Usuarios distintos en 7 días |
| Usuarios recurrentes | Usuarios que vuelven en otra semana |
| Eventos vistos | Fichas de evento abiertas |
| Clics a mapa | Clics en “cómo llegar” |
| Clics a reserva | Clics en reserva |
| Clics a entradas | Clics en compra de entradas |
| Escaneos QR | Escaneos desde alojamiento |
| Origen del tráfico | Web, QR, canal, Instagram, etc. |

### Calidad

| Métrica | Definición |
|---|---|
| Errores materiales | Fecha, hora, local o precio incorrecto |
| Eventos duplicados | Duplicados visibles |
| Cancelaciones tardías | Cancelaciones detectadas después del evento |
| Tiempo por evento | Minutos de curación |
| Horas semanales | Tiempo total de operación |

### Comercial

| Métrica | Definición |
|---|---|
| Campañas vendidas | Número de promociones activadas |
| Ingresos | Importe facturado |
| Renovaciones | Clientes que repiten campaña |
| Ingresos recurrentes | Ingresos mensuales repetibles |
| Coste operativo | Servidor, herramientas y horas imputadas |
| Beneficio real | Ingresos menos costes y horas |

---

## 8. Informe semanal interno

```text
Semana: [fecha]
Ciudad: Palencia

Usuarios únicos: [X]
Usuarios recurrentes: [X]
Eventos publicados: [X]
Eventos con error material: [X]
Cancelaciones detectadas: [X]
Tiempo de curación: [X horas]

Escaneos QR: [X]
Origen principal: [canal]

Campañas vendidas: [X]
Ingresos: [X €]
Renovaciones: [X]
Coste operativo: [X €]
Beneficio real estimado: [X €]

Aprendizajes:
- [Aprendizaje 1]
- [Aprendizaje 2]

Decisiones:
- [Decisión 1]
- [Decisión 2]
```

---

## 9. Informe post-evento para el hostelero

```text
Hola [Nombre], así ha rendido vuestro evento “ [Evento] ” en VayaPlan:

• Visualizaciones de la tarjeta: [X]
• Clics en “Cómo llegar”: [X]
• Clics en reserva/entradas/perfil: [X]
• Alcance en nuestro canal: [X]

Estos son datos de interacción, no una garantía de asistencia.

Gracias por confiar en VayaPlan. Si queréis destacar vuestro próximo evento, podemos activarlo por 19 €.
```

---

## 10. Reglas de integridad comercial

1. “Recomendado” siempre es editorial.
2. “Promocionado” siempre es publicidad.
3. Nunca se oculta información esencial para forzar clics.
4. Nunca se promete asistencia o aforo.
5. Nunca se venden datos personales.
6. Nunca se publica un evento sin verificar.
7. Si una campaña no puede medirse, no se vende como medible.
8. Si un evento se cancela, se reprograma o se devuelve el importe.
