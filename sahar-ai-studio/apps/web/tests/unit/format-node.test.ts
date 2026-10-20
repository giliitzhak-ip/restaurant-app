import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { formatNode } from '@/lib/i18n/format-node';

const render = (node: ReturnType<typeof formatNode>) =>
  renderToStaticMarkup(createElement(Fragment, null, node));

describe('formatNode', () => {
  it('inserts nodes for placeholders and keeps the rest of the text', () => {
    expect(
      render(formatNode('Hello, {name}!', { name: createElement('bdi', null, 'שרונה') })),
    ).toBe('Hello, <bdi>שרונה</bdi>!');
  });

  it('leaves unknown placeholders visible', () => {
    expect(render(formatNode('{a} {b}', { a: 'x' }))).toBe('x {b}');
  });
});
