/**
 * AsyncLocalStorage — contexte utilisateur par requête.
 * Permet à getDb() et loadData() de connaître l'utilisateur courant
 * sans modifier les signatures de chaque route.
 */
const { AsyncLocalStorage } = require('async_hooks');
const storage = new AsyncLocalStorage();

function getUserId() {
  return storage.getStore()?.userId || 'default';
}

function runWithUser(userId, fn) {
  return storage.run({ userId }, fn);
}

module.exports = { getUserId, runWithUser };
