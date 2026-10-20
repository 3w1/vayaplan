import { describe, expect, test } from 'bun:test';
import vm from 'node:vm';
import { renderAdminHtml } from '../admin';

export interface InlineScript {
  attrs: string;
  type: string;
  isModule: boolean;
  content: string;
}

export function extractExecutableInlineScripts(html: string): InlineScript[] {
  const scriptRegex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  const scripts: InlineScript[] = [];
  let match: RegExpExecArray | null;

  while ((match = scriptRegex.exec(html)) !== null) {
    const attrs = match[1];
    const content = match[2].trim();

    // 1. Omitir scripts vacíos o scripts externos cargados mediante src
    if (!content || /src\s*=/i.test(attrs)) {
      continue;
    }

    // 2. Determinar tipo MIME del script
    const typeMatch = attrs.match(/type\s*=\s*["']([^"']+)["']/i);
    const scriptType = typeMatch ? typeMatch[1].trim().toLowerCase() : 'text/javascript';

    // 3. Omitir bloques de datos (ej. JSON-LD, JSON de configuración)
    if (scriptType === 'application/ld+json' || scriptType === 'application/json') {
      continue;
    }

    const isModule = scriptType === 'module';
    scripts.push({
      attrs,
      type: scriptType,
      isModule,
      content,
    });
  }

  return scripts;
}

export function validateScriptSyntax(script: InlineScript): { valid: boolean; error?: string } {
  try {
    if (script.isModule) {
      new vm.SourceTextModule(script.content);
    } else {
      new vm.Script(script.content);
    }
    return { valid: true };
  } catch (err: any) {
    return { valid: false, error: err?.message || String(err) };
  }
}

describe('apps/web — Validación de Sintaxis JavaScript en HTML Generado por Admin', () => {
  test('la validación sintáctica detecta y falla ante expresiones TypeScript como "as HTMLSelectElement"', () => {
    const fakeTsScript: InlineScript = {
      attrs: '',
      type: 'text/javascript',
      isModule: false,
      content: 'const catEl = document.getElementById("venue-category") as HTMLSelectElement | null;',
    };
    const result = validateScriptSyntax(fakeTsScript);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Unexpected identifier 'as'");
  });

  test('todos los scripts inline de renderAdminHtml() son JavaScript válido para navegador', () => {
    const html = renderAdminHtml();
    const inlineScripts = extractExecutableInlineScripts(html);

    expect(inlineScripts.length).toBeGreaterThan(0);

    const failures: { index: number; error: string; snippet: string }[] = [];
    inlineScripts.forEach((script, idx) => {
      const res = validateScriptSyntax(script);
      if (!res.valid) {
        failures.push({
          index: idx + 1,
          error: res.error || 'Unknown syntax error',
          snippet: script.content.slice(0, 150),
        });
      }
    });

    expect(failures).toEqual([]);
  });
});
