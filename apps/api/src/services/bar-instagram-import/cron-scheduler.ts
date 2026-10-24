import { runInstagramIngestion, isExecutionLocked } from './instagram-ingestion-service';

/**
 * Validador de ventana de tiempo para Miércoles y Viernes a las 12:00 Europe/Madrid
 * (Permite verificar si una fecha/hora corresponde a la ventana de ejecución del cron)
 */
export function isScheduledExecutionWindow(date: Date = new Date()): boolean {
  // Convertir a hora de Madrid
  const madridTimeStr = date.toLocaleString('en-US', { timeZone: 'Europe/Madrid' });
  const madridDate = new Date(madridTimeStr);

  const dayOfWeek = madridDate.getDay(); // 0 = Domingo, 1 = Lunes, ..., 3 = Miércoles, 5 = Viernes
  const hours = madridDate.getHours();
  const minutes = madridDate.getMinutes();

  // Miércoles (3) o Viernes (5) a las 12:00
  const isTargetDay = dayOfWeek === 3 || dayOfWeek === 5;
  const isTargetHour = hours === 12;

  return isTargetDay && isTargetHour;
}

let cronIntervalTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Inicia el cron programado en segundo plano en el backend
 */
export function startInstagramIngestionCron(intervalMs: number = 60000): void {
  if (cronIntervalTimer) return;

  let lastExecutedDay = -1;
  let lastExecutedHour = -1;

  cronIntervalTimer = setInterval(async () => {
    try {
      const now = new Date();
      const madridDate = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Madrid' }));
      const day = madridDate.getDay();
      const hour = madridDate.getHours();

      // Comprobar si corresponde a Miércoles o Viernes a las 12:00 y no se ha ejecutado ya en esta hora
      if (isScheduledExecutionWindow(now)) {
        if (lastExecutedDay === day && lastExecutedHour === hour) {
          return; // Ya ejecutado en esta misma hora
        }

        lastExecutedDay = day;
        lastExecutedHour = hour;

        console.log(
          JSON.stringify({
            timestamp: now.toISOString(),
            level: 'info',
            service: 'instagram_cron_worker',
            message: 'Iniciando ejecución programada semanal (Miércoles/Viernes 12:00 Madrid)',
          })
        );

        await runInstagramIngestion({
          onlyActive: true,
          executionType: 'cron_scheduled',
        });
      }
    } catch (err: any) {
      console.error(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'error',
          service: 'instagram_cron_worker',
          message: 'Error en ejecución programada de Instagram',
          error: err.message,
        })
      );
    }
  }, intervalMs);

  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      service: 'instagram_cron_worker',
      message: 'Worker de cron de Instagram programado iniciado (horario: Miércoles y Viernes 12:00 Europe/Madrid).',
    })
  );
}

export function stopInstagramIngestionCron(): void {
  if (cronIntervalTimer) {
    clearInterval(cronIntervalTimer);
    cronIntervalTimer = null;
  }
}
