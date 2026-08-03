// Progression persistée en localStorage : exercices réussis + module courant.
const KEY = 'ultracoach-sql-progress-v1';

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || { done: {}, current: 'm00' }; }
  catch { return { done: {}, current: 'm00' }; }
}
function save(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function getProgress() { return load(); }

export function markExerciseDone(exId) {
  const s = load();
  s.done[exId] = true;
  save(s);
  return s;
}

export function setCurrentModule(moduleId) {
  const s = load();
  s.current = moduleId;
  save(s);
  return s;
}

export function isExerciseDone(exId) {
  return !!load().done[exId];
}

export function moduleProgress(moduleId, exerciseIds) {
  const s = load();
  const done = exerciseIds.filter((id) => s.done[id]).length;
  return { done, total: exerciseIds.length };
}

export function resetProgress() {
  localStorage.removeItem(KEY);
}
