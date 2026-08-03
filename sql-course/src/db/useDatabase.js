import { useEffect, useRef, useState, useCallback } from 'react';
import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

/**
 * Charge sql.js (SQLite en WASM) et la base d'entraînement dans le navigateur.
 * Tout se passe côté client : rien n'est envoyé à un serveur, la vraie base
 * UltraCoach n'est jamais touchée. `reset()` recharge une copie fraîche.
 */
export function useDatabase() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const SQLRef = useRef(null);
  const bufRef = useRef(null);
  const dbRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const SQL = await initSqlJs({ locateFile: () => wasmUrl });
        const buf = await fetch(`${import.meta.env.BASE_URL}training.sqlite`).then((r) => {
          if (!r.ok) throw new Error('training.sqlite introuvable (lance `npm run gen-db`)');
          return r.arrayBuffer();
        });
        if (cancelled) return;
        SQLRef.current = SQL;
        bufRef.current = new Uint8Array(buf);
        dbRef.current = new SQL.Database(bufRef.current);
        setReady(true);
      } catch (e) {
        if (!cancelled) setError(e.message || String(e));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /** Exécute du SQL. Renvoie { columns, rows, rowsModified, elapsedMs } ou { error }. */
  const run = useCallback((sql) => {
    const db = dbRef.current;
    if (!db) return { error: 'Base non prête' };
    const t0 = performance.now();
    try {
      const res = db.exec(sql);
      const elapsedMs = Math.round((performance.now() - t0) * 100) / 100;
      const last = res[res.length - 1];
      if (!last) {
        return { columns: [], rows: [], rowsModified: db.getRowsModified(), elapsedMs };
      }
      return { columns: last.columns, rows: last.values, rowsModified: db.getRowsModified(), elapsedMs };
    } catch (e) {
      return { error: e.message || String(e), elapsedMs: Math.round((performance.now() - t0) * 100) / 100 };
    }
  }, []);

  /** Recharge une copie fraîche de la base (annule les INSERT/UPDATE/DELETE). */
  const reset = useCallback(() => {
    if (!SQLRef.current || !bufRef.current) return;
    try { dbRef.current?.close(); } catch { /* noop */ }
    dbRef.current = new SQLRef.current.Database(bufRef.current);
  }, []);

  return { ready, error, run, reset };
}
