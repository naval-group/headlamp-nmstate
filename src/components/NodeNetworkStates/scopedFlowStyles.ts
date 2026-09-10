import { FLOW_BASE_CSS } from './flowBaseCss';

/** Container class every rule from React Flow's stylesheet is confined to. */
export const TOPOLOGY_SCOPE = 'nmstate-topo';

/**
 * Prefixes every selector of a stylesheet with a container class.
 *
 * React Flow's stylesheet uses global `.react-flow__*` class names — the very
 * same ones Headlamp's own resource Map uses — and the plugin build injects any
 * CSS it bundles into the document at load time. Left alone, that would restyle
 * Headlamp's Map from every page of the app. Scoping the rules keeps them
 * matching only inside the plugin's own canvas.
 *
 * The stylesheet itself is vendored by scripts/extract-flow-css.mjs rather than
 * imported, because importing it — `?raw` included — is what triggers the
 * global injection in the first place.
 */
export function scopeCss(css: string, scope: string): string {
  const prefix = `.${scope} `;
  let out = '';
  let i = 0;

  while (i < css.length) {
    const braceIndex = css.indexOf('{', i);
    if (braceIndex === -1) {
      out += css.slice(i);
      break;
    }

    const prelude = css.slice(i, braceIndex);
    const trimmed = prelude.trim();

    // At-rules such as @media or @supports wrap further rules: keep the
    // at-rule itself and recurse into its body. @keyframes bodies hold
    // percentage steps rather than selectors, so they are copied verbatim.
    if (trimmed.startsWith('@')) {
      const body = extractBlock(css, braceIndex);
      const isConditional = /^@(media|supports|layer|container)/i.test(trimmed);
      out += `${prelude}{${isConditional ? scopeCss(body.content, scope) : body.content}}`;
      i = body.end;
      continue;
    }

    const scoped = trimmed
      .split(',')
      .map(sel => sel.trim())
      .filter(Boolean)
      .map(sel => prefix + sel)
      .join(',');

    const body = extractBlock(css, braceIndex);
    out += `${scoped}{${body.content}}`;
    i = body.end;
  }

  return out;
}

/** Returns the contents of the brace block opening at `open`, and the index past it. */
function extractBlock(css: string, open: number): { content: string; end: number } {
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') {
      depth--;
      if (depth === 0) return { content: css.slice(open + 1, i), end: i + 1 };
    }
  }
  return { content: css.slice(open + 1), end: css.length };
}

/** React Flow's base stylesheet, confined to the plugin's topology canvas. */
export const scopedFlowCss = scopeCss(FLOW_BASE_CSS, TOPOLOGY_SCOPE);
