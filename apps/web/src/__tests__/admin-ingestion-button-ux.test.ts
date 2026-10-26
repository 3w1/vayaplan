import { describe, expect, test } from 'bun:test';
import vm from 'node:vm';
import { renderAdminHtml } from '../admin';
import { extractExecutableInlineScripts } from './admin-script-syntax.test';

describe('apps/web — UX y Robustez del Botón de Ingesta Manual (admin.ts)', () => {
  function setupTestEnvironment(apiFetchMock: any) {
    const html = renderAdminHtml();
    const scripts = extractExecutableInlineScripts(html);
    const sourcesScript = scripts.find((s) => s.content.includes('window.runSingleSource'));
    expect(sourcesScript).toBeDefined();

    const alertBoxState = {
      style: {
        display: 'none',
        background: '',
        color: '',
        border: '',
      },
      innerHTML: '',
    };

    const domElements: Record<string, any> = {
      'sources-alert-box': alertBoxState,
      'sources-tbody': { innerHTML: '' },
      'sources-cards-container': { innerHTML: '' },
      'sources-count-badge': { innerText: '' },
      'btn-run-selected-sources': { disabled: true },
      'selected-sources-count': { innerText: '0' },
      'modal-report-body': { innerHTML: '' },
    };

    const alertsShown: string[] = [];
    const confirmsAsked: string[] = [];

    const mockSourcesList = [
      {
        id: 2,
        venue_id: 10011,
        venue_name: 'Bar La Malhablada',
        instagram_username: 'lamalhabladapalencia',
        posts_per_run: 5,
        include_reels: true,
      },
      {
        id: 11,
        venue_id: 10037,
        venue_name: 'LinaMorganFreeman',
        instagram_username: 'bar_linamorganfreeman',
        posts_per_run: 5,
        include_reels: true,
      },
    ];

    const compositeFetch = async (url: string, options: any) => {
      if (url === '/api/v1/admin/instagram-ingestion-sources' && (!options || options.method === 'GET' || !options.method)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ sources: mockSourcesList }),
        };
      }
      return apiFetchMock(url, options);
    };

    const sandbox: any = {
      window: {},
      document: {
        getElementById: (id: string) => {
          if (!domElements[id]) {
            domElements[id] = {
              style: { display: 'none' },
              innerHTML: '',
              innerText: '',
              disabled: false,
            };
          }
          return domElements[id];
        },
        querySelectorAll: () => [],
        addEventListener: () => {},
        body: { classList: { add: () => {}, remove: () => {}, toggle: () => {} } },
      },
      confirm: (msg: string) => {
        confirmsAsked.push(msg);
        return true;
      },
      alert: (msg: string) => {
        alertsShown.push(msg);
      },
      escapeHtml: (str: string) => str,
      fetch: compositeFetch,
      apiFetch: compositeFetch,
      localStorage: {
        getItem: () => 'mock-admin-token',
        setItem: () => {},
        removeItem: () => {},
      },
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
    };

    sandbox.window = sandbox;
    vm.createContext(sandbox);

    // Ejecutar el script inline de administración dentro del sandbox
    vm.runInContext(sourcesScript!.content, sandbox);

    return { sandbox, alertBoxState, alertsShown, confirmsAsked };
  }

  test('1. runSingleSource envía un POST con body "{}" explícito', async () => {
    const capturedCalls: Array<{ url: string; options: any }> = [];

    const mockApiFetch = async (url: string, options: any) => {
      capturedCalls.push({ url, options });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          report: {
            sourcesProcessed: 1,
            totalPostsScraped: 3,
            videosSkipped: 2,
            proposalsCreated: 0,
            duplicatesSkipped: 1,
            errors: [],
            resultsBySource: [],
          },
        }),
      };
    };

    const { sandbox, alertBoxState } = setupTestEnvironment(mockApiFetch);

    // Cargar fuentes para que cachedSources esté poblado
    await sandbox.loadAdminSources();
    capturedCalls.length = 0; // Limpiar la llamada de carga inicial

    // Ejecutar sobre la fuente 11 (LinaMorganFreeman)
    await sandbox.runSingleSource(11);

    expect(capturedCalls.length).toBeGreaterThanOrEqual(1);
    const runCall = capturedCalls[0];
    expect(runCall.url).toBe('/api/v1/admin/instagram-ingestion-sources/11/run');
    expect(runCall.options.method).toBe('POST');
    expect(runCall.options.body).toBe('{}');
    // Tras finalizar con éxito, el alertBox queda oculto
    expect(alertBoxState.style.display).toBe('none');
  });

  test('2. Limpieza del estado visual de carga ante error HTTP (400, 500) y excepciones de red', async () => {
    // 2.1 Error HTTP 400
    let alertBoxDisplayDuringError = '';
    const mock400Fetch = async () => {
      return {
        ok: false,
        status: 400,
        json: async () => ({
          error: 'invalid_json',
          message: 'Cuerpo de petición JSON no válido.',
        }),
      };
    };

    const { sandbox: sb400, alertBoxState: ab400, alertsShown: alerts400 } = setupTestEnvironment(mock400Fetch);
    await sb400.runSingleSource(11);

    expect(alerts400.length).toBe(1);
    expect(alerts400[0]).toContain('Cuerpo de petición JSON no válido.');
    expect(ab400.style.display).toBe('none');

    // 2.2 Excepción de red / timeout
    const mockNetworkErrorFetch = async () => {
      throw new Error('Network timeout');
    };

    const { sandbox: sbNet, alertBoxState: abNet, alertsShown: alertsNet } = setupTestEnvironment(mockNetworkErrorFetch);
    await sbNet.runSingleSource(2);

    expect(alertsNet.length).toBe(1);
    expect(alertsNet[0]).toContain('Error de conexión: Network timeout');
    expect(abNet.style.display).toBe('none');
  });

  test('3. Prevención de dobles clics: un segundo clic mientras la petición está en vuelo no duplica peticiones', async () => {
    let apiCallCount = 0;
    let resolveFirstCall: (val: any) => void = () => {};

    let isDelayed = true;
    const delayedFetch = async (url: string, options: any) => {
      apiCallCount++;
      if (isDelayed) {
        return new Promise((resolve) => {
          resolveFirstCall = () => {
            resolve({
              ok: true,
              status: 200,
              json: async () => ({ success: true, report: {} }),
            });
          };
        });
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, report: {} }),
      };
    };

    const { sandbox, alertBoxState } = setupTestEnvironment(delayedFetch);

    // Cargar fuentes para popular cachedSources
    await sandbox.loadAdminSources();
    apiCallCount = 0; // Resetear contador tras carga inicial

    // Primer clic: inicia la petición
    const promise1 = sandbox.runSingleSource(11);
    expect(apiCallCount).toBe(1);
    expect(alertBoxState.style.display).toBe('block');
    expect(alertBoxState.innerHTML).toContain('LinaMorganFreeman');

    // Segundo clic inmediato mientras la primera petición está en vuelo
    const promise2 = sandbox.runSingleSource(11);
    expect(apiCallCount).toBe(1); // NO se incrementa

    // Tercer clic sobre otra fuente mientras está en vuelo
    const promise3 = sandbox.runSingleSource(2);
    expect(apiCallCount).toBe(1); // NO se incrementa

    // Resolver la petición en vuelo
    resolveFirstCall(null);
    await promise1;
    await promise2;
    await promise3;

    expect(apiCallCount).toBe(1);
    expect(alertBoxState.style.display).toBe('none');

    // Tras finalizar, un nuevo clic vuelve a ser permitido
    isDelayed = false;
    await sandbox.runSingleSource(11);
    expect(apiCallCount).toBe(2);
  });

  test('4. runAllActiveSources también envía "{}" y limpia estado en finally ante error', async () => {
    let capturedOptions: any = null;
    const mockAllActive = async (url: string, options: any) => {
      capturedOptions = options;
      return {
        ok: false,
        status: 500,
        json: async () => ({ message: 'Error interno en ingesta masiva' }),
      };
    };

    const { sandbox, alertBoxState, alertsShown } = setupTestEnvironment(mockAllActive);
    await sandbox.runAllActiveSources();

    expect(capturedOptions.method).toBe('POST');
    expect(capturedOptions.body).toBe('{}');
    expect(alertsShown[0]).toContain('Error interno en ingesta masiva');
    expect(alertBoxState.style.display).toBe('none');
  });
});
