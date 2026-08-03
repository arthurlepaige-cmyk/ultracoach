import React from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { sql, SQLite } from '@codemirror/lang-sql';
import { SCHEMA } from '../lessons/schema.js';

// { activities: ['id', 'date', ...], races: [...], ... } pour l'autocomplétion
// des tables et de leurs colonnes (dérivé de la référence de schéma).
const SCHEMA_MAP = Object.fromEntries(
  SCHEMA.map((t) => [t.name, t.columns.map((c) => c[0])])
);

export default function SqlEditor({ value, onChange, onRun, height = '140px' }) {
  const handleKey = (e) => {
    // Ctrl/Cmd + Entrée = exécuter
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      onRun?.();
    }
  };
  return (
    <div className="editor" onKeyDown={handleKey}>
      <CodeMirror
        value={value}
        height={height}
        theme="dark"
        extensions={[sql({ dialect: SQLite, schema: SCHEMA_MAP, upperCaseKeywords: true })]}
        onChange={onChange}
        basicSetup={{ lineNumbers: true, highlightActiveLine: true, autocompletion: true }}
      />
    </div>
  );
}
