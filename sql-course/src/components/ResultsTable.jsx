import React from 'react';

export default function ResultsTable({ result }) {
  if (!result) return null;
  if (result.error) {
    return <div className="result-error">⚠ {result.error}</div>;
  }
  const { columns = [], rows = [], rowsModified = 0, elapsedMs } = result;

  if (columns.length === 0) {
    return (
      <div className="result-ok">
        Requête exécutée{rowsModified ? ` — ${rowsModified} ligne(s) affectée(s)` : ''} ·{' '}
        <span className="muted">{elapsedMs} ms</span>
      </div>
    );
  }

  const MAX = 200;
  const shown = rows.slice(0, MAX);

  return (
    <div className="result-wrap">
      <div className="result-meta">
        {rows.length} ligne(s){rows.length > MAX ? ` (affichage des ${MAX} premières)` : ''} ·{' '}
        <span className="muted">{elapsedMs} ms</span>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>{columns.map((c, i) => <th key={i}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {shown.map((r, ri) => (
              <tr key={ri}>
                {r.map((v, ci) => (
                  <td key={ci} className={v === null ? 'null-cell' : ''}>
                    {v === null ? 'NULL' : String(v)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
