import React, { useMemo, useState } from 'react';
import { useDatabase } from './db/useDatabase.js';
import { MODULES } from './lessons/index.js';
import Sidebar from './components/Sidebar.jsx';
import LessonView from './components/LessonView.jsx';
import SchemaViewer from './components/SchemaViewer.jsx';
import { getProgress, setCurrentModule, resetProgress } from './lib/progress.js';

export default function App() {
  const { ready, error, run, reset } = useDatabase();
  const [current, setCurrent] = useState(() => getProgress().current || MODULES[0].id);
  const [tick, setTick] = useState(0);

  const module = useMemo(() => MODULES.find((m) => m.id === current), [current]);
  const idx = MODULES.findIndex((m) => m.id === current);

  const select = (id) => {
    setCurrent(id);
    if (id !== 'schema') setCurrentModule(id);
    window.scrollTo({ top: 0 });
  };

  const onSolved = () => setTick((t) => t + 1);

  const resetAll = () => {
    if (confirm('Réinitialiser toute ta progression ?')) {
      resetProgress();
      setTick((t) => t + 1);
      setCurrent(MODULES[0].id);
    }
  };

  return (
    <div className="app">
      <Sidebar
        modules={MODULES}
        current={current}
        onSelect={select}
        onReset={resetAll}
        progressTick={tick}
      />

      <main className="main">
        {error && <div className="fatal">Impossible de charger la base : {error}</div>}
        {!ready && !error && <div className="loading">Chargement de la base SQLite (WASM)…</div>}

        {ready && current === 'schema' && <SchemaViewer />}
        {ready && current !== 'schema' && module && (
          <>
            <LessonView key={module.id} module={module} run={run} onSolved={onSolved} />
            <div className="module-nav">
              {idx > 0 && (
                <button className="btn btn-ghost" onClick={() => select(MODULES[idx - 1].id)}>
                  ← {MODULES[idx - 1].navTitle || MODULES[idx - 1].title}
                </button>
              )}
              <span className="spacer" />
              <button className="btn btn-ghost small" onClick={reset} title="Annuler les INSERT/UPDATE/DELETE">
                ↺ Restaurer la base
              </button>
              {idx < MODULES.length - 1 && (
                <button className="btn btn-primary" onClick={() => select(MODULES[idx + 1].id)}>
                  {MODULES[idx + 1].navTitle || MODULES[idx + 1].title} →
                </button>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
