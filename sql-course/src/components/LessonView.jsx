import React, { useRef, useState } from 'react';
import SqlEditor from './SqlEditor.jsx';
import ResultsTable from './ResultsTable.jsx';
import Exercise from './Exercise.jsx';
import { Inline } from '../lib/inline.jsx';

export default function LessonView({ module, run, onSolved }) {
  const [scratch, setScratch] = useState('SELECT * FROM activities LIMIT 10;');
  const [result, setResult] = useState(null);
  const playgroundRef = useRef(null);

  const runScratch = (sqlText) => {
    const q = sqlText ?? scratch;
    if (sqlText != null) setScratch(sqlText);
    setResult(run(q));
  };

  const tryExample = (sqlText) => {
    setScratch(sqlText);
    setResult(run(sqlText));
    playgroundRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  return (
    <article className="lesson">
      <header className="lesson-header">
        <h1>{module.title}</h1>
        {module.subtitle && <p className="lesson-sub">{module.subtitle}</p>}
      </header>

      {module.blocks.map((b, i) => {
        switch (b.t) {
          case 'h':
            return <h2 key={i} className="l-h">{b.text}</h2>;
          case 'p':
            return <p key={i} className="l-p"><Inline text={b.text} /></p>;
          case 'note':
            return (
              <div key={i} className="callout portability">
                <span className="callout-tag">Portabilité</span>
                <span><Inline text={b.text} /></span>
              </div>
            );
          case 'tip':
            return (
              <div key={i} className="callout tip">
                <span className="callout-tag">Astuce</span>
                <span><Inline text={b.text} /></span>
              </div>
            );
          case 'warn':
            return (
              <div key={i} className="callout warn">
                <span className="callout-tag">Attention</span>
                <span><Inline text={b.text} /></span>
              </div>
            );
          case 'code':
            return (
              <div key={i} className="example">
                {b.caption && <div className="example-cap"><Inline text={b.caption} /></div>}
                <pre className="example-sql"><code>{b.sql}</code></pre>
                <button className="btn btn-ghost small" onClick={() => tryExample(b.sql)}>▶ Essayer dans le bac à sable</button>
              </div>
            );
          case 'ex':
            return <Exercise key={i} exercise={b} run={run} onSolved={onSolved} />;
          default:
            return null;
        }
      })}

      <section ref={playgroundRef} className="playground">
        <h2 className="l-h">🧪 Bac à sable</h2>
        <p className="l-p muted">Teste librement n'importe quelle requête ici. Rien n'est enregistré, tu peux tout casser.</p>
        <SqlEditor value={scratch} onChange={setScratch} onRun={() => runScratch()} height="150px" />
        <div className="ex-actions">
          <button className="btn btn-primary" onClick={() => runScratch()}>▶ Exécuter <kbd>⌘⏎</kbd></button>
        </div>
        <ResultsTable result={result} />
      </section>
    </article>
  );
}
