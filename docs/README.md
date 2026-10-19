# VayaPlan — Documentación del MVP

Piloto: **Palencia**  
Versión: **1.0**  
Fecha: **14 de octubre de 2026**

## Documentos

1. [PRD y especificación funcional](./01-prd.md)
2. [Modelo de datos y contratos de API](./02-data-model.md)
3. [Protocolo de ingesta y manual operativo](./03-ingestion-runbook.md)
4. [Arquitectura técnica y despliegue](./04-architecture.md)
5. [Roadmap técnico y sprint backlog](./05-sprint-backlog.md)
6. [Playbook comercial y métricas de validación](./06-gtm-playbook.md)
7. [Manual operativo del piloto de ampliación de agenda](./agenda-expansion-pilot-runbook.md)

## Recomendación de modelos para Antigravity

- **Gemini Pro / modelo avanzado:** arquitectura, decisiones de producto, revisión de esquema, refactors, debugging complejo y planificación.
- **Gemini Flash / modelo rápido:** implementación repetitiva, componentes UI, endpoints CRUD, tests, migraciones simples y generación de contenido operativo.
- **Flujo recomendado:** Pro para definir y revisar; Flash para ejecutar tareas acotadas; Pro para revisar antes de merge.

## Regla de ejecución

No empezar a codificar sin tener aprobados:

1. `01-prd.md`
2. `02-data-model.md`
3. `03-ingestion-runbook.md`

El resto puede evolucionar durante el piloto.
