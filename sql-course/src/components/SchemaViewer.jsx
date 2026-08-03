import React from 'react';
import { SCHEMA } from '../lessons/schema.js';

export default function SchemaViewer() {
  return (
    <article className="lesson">
      <header className="lesson-header">
        <h1>📐 Schéma de la base</h1>
        <p className="lesson-sub">Ta référence : les 4 tables, leurs colonnes et leurs relations. Reviens ici dès que tu as un doute.</p>
      </header>

      <div className="callout tip">
        <span className="callout-tag">Relations</span>
        <span>
          <code className="ic">activities.type_id</code> pointe vers <code className="ic">activity_types.id</code> · {' '}
          <code className="ic">activities.race_id</code> pointe vers <code className="ic">races.id</code> (NULL si l'activité n'est pas une course) · {' '}
          <code className="ic">activities.date</code> se relie à <code className="ic">daily_metrics.date</code> pour enrichir une sortie avec la forme du jour.
        </span>
      </div>

      {SCHEMA.map((t) => (
        <div key={t.name} className="schema-table">
          <h2 className="l-h">
            {t.name} <span className="schema-count">{t.rows} lignes</span>
          </h2>
          <p className="l-p muted">{t.desc}</p>
          <div className="table-scroll">
            <table>
              <thead><tr><th>Colonne</th><th>Type</th><th>Description</th></tr></thead>
              <tbody>
                {t.columns.map((c) => (
                  <tr key={c[0]}>
                    <td><code className="ic">{c[0]}</code></td>
                    <td className="muted">{c[1]}</td>
                    <td>{c[2]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </article>
  );
}
