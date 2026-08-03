/**
 * Validation d'exercice : compare le résultat de la requête de l'apprenant à
 * celui de la solution de référence. Tolérant sur les décimales et le nom des
 * colonnes, strict sur les valeurs. `ordered` impose l'ordre des lignes.
 */
function cellToStr(v) {
  if (v === null || v === undefined) return '∅';
  if (typeof v === 'number') {
    return Number.isInteger(v) ? String(v) : v.toFixed(3);
  }
  return String(v);
}

function normalize(result, ordered) {
  const rows = (result.rows || []).map((r) => r.map(cellToStr));
  if (!ordered) {
    rows.sort((a, b) => a.join('\u0001').localeCompare(b.join('\u0001')));
  }
  return { nCols: (result.columns || []).length, rows };
}

/**
 * @returns { ok: boolean, message: string }
 */
export function checkExercise(userResult, solutionResult, ordered = false) {
  if (userResult.error) {
    return { ok: false, message: `Erreur SQL : ${userResult.error}` };
  }
  const u = normalize(userResult, ordered);
  const s = normalize(solutionResult, ordered);

  if (u.rows.length !== s.rows.length) {
    return {
      ok: false,
      message: `Nombre de lignes incorrect : ${s.rows.length} attendue(s), ${u.rows.length} obtenue(s).`,
    };
  }
  if (u.nCols !== s.nCols) {
    return {
      ok: false,
      message: `Nombre de colonnes incorrect : ${s.nCols} attendue(s), ${u.nCols} obtenue(s).`,
    };
  }
  for (let i = 0; i < s.rows.length; i++) {
    if (u.rows[i].join('\u0001') !== s.rows[i].join('\u0001')) {
      return {
        ok: false,
        message: ordered
          ? `Les valeurs diffèrent (regarde l'ordre des lignes, ligne ${i + 1}).`
          : `Les valeurs ne correspondent pas. Vérifie tes colonnes et tes filtres.`,
      };
    }
  }
  return { ok: true, message: 'Bravo — résultat exact ! ✅' };
}
