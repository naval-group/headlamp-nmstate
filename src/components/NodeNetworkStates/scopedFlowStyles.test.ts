import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FLOW_BASE_CSS } from './flowBaseCss';
import { scopedFlowCss } from './scopedFlowStyles';
import { scopeCss } from './scopedFlowStyles';

describe('scopeCss', () => {
  it('prefixes a simple rule', () => {
    expect(scopeCss('.react-flow__node{color:red}', 'topo')).toBe(
      '.topo .react-flow__node{color:red}'
    );
  });

  it('prefixes every selector of a list', () => {
    expect(scopeCss('.a,.b{x:1}', 'topo')).toBe('.topo .a,.topo .b{x:1}');
  });

  it('recurses into conditional at-rules', () => {
    expect(scopeCss('@media (min-width:1px){.a{x:1}}', 'topo')).toBe(
      '@media (min-width:1px){.topo .a{x:1}}'
    );
  });

  it('leaves keyframe steps untouched', () => {
    const css = '@keyframes dash{from{a:1}to{a:2}}';
    expect(scopeCss(css, 'topo')).toBe(css);
  });

  it('leaves no unscoped react-flow selector in the shipped stylesheet', () => {
    // Guards the actual risk: an escaped rule would restyle Headlamp's own Map.
    for (const rule of scopedFlowCss.split('}')) {
      const selector = rule.split('{')[0];
      if (!selector.includes('.react-flow')) continue;
      for (const part of selector.split(',')) {
        if (part.trim()) expect(part.trim().startsWith('.nmstate-topo')).toBe(true);
      }
    }
  });

  it('scopes the whole upstream stylesheet without dropping it', () => {
    expect(scopedFlowCss.length).toBeGreaterThan(1000);
    expect(scopedFlowCss).toContain('.nmstate-topo .react-flow__node');
  });
});

describe('vendored React Flow stylesheet', () => {
  it('matches the installed @xyflow/react release', () => {
    // Guards against the vendored copy drifting after a dependency bump.
    const onDisk = readFileSync(require.resolve('@xyflow/react/dist/base.css'), 'utf8').trim();
    expect(FLOW_BASE_CSS).toBe(onDisk);
  });
});
