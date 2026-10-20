import { createElement, Fragment, type ReactNode } from 'react';

/**
 * Like `format`, but values may be React nodes — e.g. a user's name wrapped in <bdi> so a
 * Hebrew name inside an English sentence (or the reverse) keeps its own direction.
 */
export function formatNode(template: string, values: Record<string, ReactNode>): ReactNode {
  return template.split(/(\{\w+\})/g).map((part, i) => {
    const key = /^\{(\w+)\}$/.exec(part)?.[1];
    return createElement(Fragment, { key: i }, key && key in values ? values[key] : part);
  });
}
