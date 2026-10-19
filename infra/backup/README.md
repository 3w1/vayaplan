# VayaPlan — Sistema de Respaldo Privado Conjunto (BD + Originales)

Este subsistema implementa el respaldo automatizado, cifrado y coordinado de la base de datos PostgreSQL (`vayaplan`) y de los archivos originales privados almacenados en `/app/uploads/private-originals/`.

---

## 1. Arquitectura y Principios de Diseño

1. **Destino Aislado y Privado**:
   - Bucket Cloudflare R2 dedicado: `vayaplan-backups`.
   - Acceso público **desactivado por omisión**. No cuenta con dominio público ni subdominio `r2.dev`.
   - Credenciales de API independientes de las utilizadas por la aplicación web para `vayaplan-media`.
2. **Cifrado Autenticado Estándar (GnuPG)**:
   - Utiliza la herramienta del sistema `/usr/bin/gpg` (versión 2.4.4 mantenida).
   - Algoritmo: **AES-256 simétrico** con derivación de clave **SHA-512** e iteraciones S2K reforzadas.
   - **Autenticación e integridad (MDC - Modification Detection Code)**: Cualquier alteración de bits en tránsito o reposo provoca el rechazo inmediato del descifrado.
   - **Sin secretos visibles**: La clave (`BACKUP_ENCRYPTION_KEY`) se transmite exclusivamente por stdin (`--passphrase-fd 0`), impidiendo que sea visible en `/proc` o `ps aux`. Nunca se imprime en consola ni se almacena en Git.
3. **Consistencia Referencial sin Condiciones de Carrera**:
   - **Enlaces duros como preparación local**: Antes del volcado, se crea un snapshot mediante enlaces duros (`cp -al`).
     > [!IMPORTANT]
     > Los enlaces duros son una **preparación local para consistencia**, NO el respaldo externo. Su única función es impedir que un borrado concurrente (`unlink()`) libere inodos en el disco local mientras se genera el tarball. La copia real fuera del host es el paquete cifrado en R2.
   - **Verificación cruzada sobre el dump**: El script extrae las referencias de la tabla `events` directamente del archivo `.dump` generado por `pg_dump`. Comprueba que el 100% de los archivos físicos requeridos por ese snapshot exacto existan. Si falta algún archivo, el respaldo **aborta inmediatamente** sin publicar el lote.
4. **Soporte Pre-Migración 009 (Respaldo sin Originales)**:
   - El pipeline es 100% operativo tanto antes como después de la migración 009.
   - Si se ejecuta antes de aplicar la migración 009 (cuando no existe la columna `image_original_url` ni hay archivos en `private-originals`), genera el volcado de base de datos íntegro, empaqueta un archivo de originales vacío (`filesCount: 0`) y publica el lote de forma válida.
5. **Publicación Atómica y Protección de Lotes**:
   - Cada lote reside bajo el subprefijo: `backups/batches/vayaplan_backup_<YYYYMMDD_HHMMSS>_<hash>/`.
   - Componentes del lote:
     - `db_dump.dump.gpg`: Volcado de PostgreSQL (`pg_dump -Fc`), cifrado.
     - `private_originals.tar.gz.gpg`: Archivo comprimido con los originales privados, cifrado.
     - `manifest.json.gpg`: Manifiesto estructurado con metadatos y sumas SHA-256, cifrado.
     - `batch_verification.sha256`: Sumas de comprobación de los archivos cifrados para validación de transporte.
   - **Puntero de éxito protegido**: Solo cuando todos los archivos están transferidos y verificados, se actualiza `backups/LATEST_COMPLETE.json.gpg`.
   - **Protección contra concurrencia y regresión**: Un lock local exclusivo (`.backup.lock`) impide ejecuciones simultáneas. Una verificación monotónica en remoto impide que un lote retrasado o desfasado haga retroceder el puntero a un lote más antiguo.

---

## 2. Política de Retención, RPO y Monitorización

- **Retención (30 días)**:
  - Gestionada nativamente en Cloudflare R2 mediante la regla de ciclo de vida en [`lifecycle_rule_r2.json`](file:///root/vayaplan/infra/backup/lifecycle_rule_r2.json).
  - La regla aplica **estrictamente al prefijo `backups/batches/`**.
  - **Inmunidad del puntero**: El puntero `backups/LATEST_COMPLETE.json.gpg` no está bajo `batches/`, por lo que **nunca es eliminado accidentalmente por la regla de ciclo de vida**, garantizando que siempre se pueda localizar la última copia válida.
- **RPO (Recovery Point Objective - Pérdida Máxima de Datos)**:
  - El RPO objetivo es de **24 horas**, siempre y cuando las ejecuciones diarias programadas concluyan con éxito.
  - Este sistema es un respaldo por lotes diario; **no equivale a replicación continua de datos (CDC)**. En caso de siniestro catastrófico del host, los eventos y fotos creados en las últimas 24 horas previas al incidente se perderían.
- **Detección de Fallos y Copia Obsoleta**:
  - **Detección de fallo inmediato**: El script devuelve código de salida `1` ante cualquier fallo. En systemd, se configura directiva `OnFailure=status-alert.service`.
  - **Detección de copia obsoleta (Stale Backup Alert)**: Para detectar si las tareas programadas dejaron de ejecutarse silenciosamente, un monitor diario inspecciona la antigüedad del último respaldo:
    ```bash
    # Descargar puntero, descifrarlo y verificar que completedAt tiene menos de 26 horas
    bun run -e '
      import fs from "node:fs";
      // Si completedAt > 26 horas, emitir alerta de copia obsoleta
    '
    ```

---

## 3. Requisitos y Permisos a Autorizar por el Usuario

Para la puesta en marcha de este sistema en producción, el usuario debe autorizar y configurar:

1. **Creación del Bucket R2**:
   - Nombre: `vayaplan-backups`.
   - Ubicación: Cuenta Cloudflare de VayaPlan.
   - Acceso público: Desactivado.
2. **Generación de Token de API con Permisos Mínimos (Least Privilege)**:
   - Ámbito: Cuenta de Cloudflare -> R2 API Tokens -> Create API Token.
   - Permisos: `Object Read & Write` restringido **exclusivamente al bucket `vayaplan-backups`**.
   - No otorgar permisos de lectura/escritura sobre `vayaplan-media` ni permisos administrativos de cuenta.
3. **Regla de Ciclo de Vida**:
   - Aplicar la regla de 30 días definida en `lifecycle_rule_r2.json` en la pestaña *Settings -> Lifecycle Rules* del bucket `vayaplan-backups`:
     - Filter Prefix: `backups/batches/`
     - Action: *Delete objects after 30 days*.

---

## 4. Instrucciones para la Custodia de la Clave Fuera del VPS

> [!CAUTION]
> **NUNCA** pegues la clave de cifrado en mensajes de chat, issues de GitHub, ni la guardes en el repositorio Git.

1. **Generación de Clave Fuerte**:
   - Genera una clave aleatoria de al menos 32 caracteres (alfanumérico + símbolos):
     ```bash
     openssl rand -base64 32
     ```
2. **Custodia Externa**:
   - Almacena la clave inmediatamente en un gestor de contraseñas seguro corporativo (1Password, Bitwarden, KeePassXC) bajo la entrada: `VayaPlan — Clave de Cifrado de Respaldos (PROD)`.
   - Asegura que al menos dos administradores autorizados tengan acceso a dicha bóveda.
3. **Inyección en el Host**:
   - En el VPS, crea un archivo protegido con permisos estrictos de lectura solo para root (`chmod 600`):
     ```bash
     # Archivo: /root/vayaplan/infra/.env.backup
     BACKUP_ENCRYPTION_KEY="<clave_generada_aqui>"
     BACKUP_R2_ACCOUNT_ID="<cloudflare_account_id>"
     BACKUP_R2_ACCESS_KEY_ID="<r2_backup_access_key>"
     BACKUP_R2_SECRET_ACCESS_KEY="<r2_backup_secret_key>"
     BACKUP_R2_BUCKET="vayaplan-backups"
     ```
   - Este archivo está excluido en `.gitignore`.

---

## 5. Procedimiento Operativo: Ejecución y Restauración

### Ejecución Manual del Respaldo
```bash
/root/vayaplan/infra/backup/backup_daily.sh
```

### Verificación Aislada en Reposo (`verifyOnly`)
```bash
# Descarga, valida sumas SHA-256 de transporte y descifra el último lote en temporal para verificar integridad
VERIFY_ONLY=true bun run /root/vayaplan/infra/backup/restore_batch.ts
```
> [!NOTE]
> `VERIFY_ONLY` verifica la integridad criptográfica y la correspondencia del manifiesto sin alterar la base de datos productiva. **No sustituye** una prueba periódica de restauración real en un PostgreSQL aislado para validar la estructura interna de los datos.

### Restauración Completa de Emergencia (Host Nuevo o Reconstruido)
```bash
# 1. Configurar variables de entorno con las credenciales de respaldo y la clave de descifrado
export BACKUP_ENCRYPTION_KEY="<tu_clave_custodiada>"
export BACKUP_R2_ACCOUNT_ID="..."
export BACKUP_R2_ACCESS_KEY_ID="..."
export BACKUP_R2_SECRET_ACCESS_KEY="..."
export BACKUP_R2_BUCKET="vayaplan-backups"

# 2. Ejecutar restauración del último lote válido
bun run /root/vayaplan/infra/backup/restore_batch.ts
```
