import React from 'react';

/**
 * Mini-rendu inline : `code`, **gras**. Suffisant pour le contenu des leçons,
 * sans dépendance markdown lourde.
 */
export function Inline({ text }) {
  const parts = [];
  const re = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let last = 0, m, key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('`')) parts.push(<code key={key++} className="ic">{tok.slice(1, -1)}</code>);
    else parts.push(<strong key={key++}>{tok.slice(2, -2)}</strong>);
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}
