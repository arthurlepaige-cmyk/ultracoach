import React from 'react';
import { moduleProgress } from '../lib/progress.js';

export default function Sidebar({ modules, current, onSelect, onReset, progressTick }) {
  return (
    <nav className="sidebar">
      <div className="brand">
        <span className="logo">🏔️</span>
        <div>
          <div className="brand-title">SQL Academy</div>
          <div className="brand-sub">sur tes données UltraCoach</div>
        </div>
      </div>

      <button
        className={`nav-item nav-schema ${current === 'schema' ? 'active' : ''}`}
        onClick={() => onSelect('schema')}
      >
        📐 Schéma de la base
      </button>

      <div className="nav-section">Parcours</div>
      <ol className="nav-list">
        {modules.map((m, idx) => {
          const exIds = m.blocks.filter((b) => b.t === 'ex').map((b) => b.id);
          const { done, total } = moduleProgress(m.id, exIds);
          const complete = total > 0 && done === total;
          return (
            <li key={m.id}>
              <button
                className={`nav-item ${current === m.id ? 'active' : ''}`}
                onClick={() => onSelect(m.id)}
                data-tick={progressTick}
              >
                <span className="nav-num">{String(idx).padStart(2, '0')}</span>
                <span className="nav-label">{m.navTitle || m.title}</span>
                {total > 0 && (
                  <span className={`nav-prog ${complete ? 'full' : ''}`}>
                    {complete ? '✓' : `${done}/${total}`}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>

      <div className="sidebar-footer">
        <button className="btn btn-ghost small" onClick={onReset}>↺ Réinitialiser la progression</button>
      </div>
    </nav>
  );
}
