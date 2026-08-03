import React, { useState } from 'react';
import SqlEditor from './SqlEditor.jsx';
import ResultsTable from './ResultsTable.jsx';
import { Inline } from '../lib/inline.jsx';
import { checkExercise } from '../lib/validate.js';
import { isExerciseDone, markExerciseDone } from '../lib/progress.js';

export default function Exercise({ exercise, run, onSolved }) {
  const { id, prompt, starter = '', solution, ordered = false, hint } = exercise;
  const [code, setCode] = useState(starter);
  const [result, setResult] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [showHint, setShowHint] = useState(false);
  const [showSolution, setShowSolution] = useState(false);
  const [solved, setSolved] = useState(() => isExerciseDone(id));

  const doRun = () => {
    const r = run(code);
    setResult(r);
    setFeedback(null);
  };

  const doCheck = () => {
    const userRes = run(code);
    setResult(userRes);
    if (userRes.error) {
      setFeedback({ ok: false, message: `Erreur SQL : ${userRes.error}` });
      return;
    }
    const solRes = run(solution);
    const verdict = checkExercise(userRes, solRes, ordered);
    setFeedback(verdict);
    if (verdict.ok && !solved) {
      markExerciseDone(id);
      setSolved(true);
      onSolved?.(id);
    }
  };

  return (
    <div className={`exercise ${solved ? 'solved' : ''}`}>
      <div className="ex-head">
        <span className="ex-badge">{solved ? '✅ Réussi' : 'Exercice'}</span>
        <span className="ex-prompt"><Inline text={prompt} /></span>
      </div>
      <SqlEditor value={code} onChange={setCode} onRun={doRun} height="110px" />
      <div className="ex-actions">
        <button className="btn" onClick={doRun}>▶ Exécuter <kbd>⌘⏎</kbd></button>
        <button className="btn btn-primary" onClick={doCheck}>Vérifier</button>
        {hint && <button className="btn btn-ghost" onClick={() => setShowHint((v) => !v)}>{showHint ? "Cacher l'indice" : '💡 Indice'}</button>}
        <button className="btn btn-ghost" onClick={() => setShowSolution((v) => !v)}>{showSolution ? 'Cacher la solution' : 'Voir la solution'}</button>
      </div>
      {showHint && hint && <div className="hint"><Inline text={hint} /></div>}
      {showSolution && (
        <pre className="solution"><code>{solution}</code></pre>
      )}
      {feedback && (
        <div className={feedback.ok ? 'feedback ok' : 'feedback ko'}>{feedback.message}</div>
      )}
      <ResultsTable result={result} />
    </div>
  );
}
