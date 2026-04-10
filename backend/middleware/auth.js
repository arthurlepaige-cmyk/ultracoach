const jwt = require('jsonwebtoken');
const { runWithUser } = require('../userContext');

const JWT_SECRET = process.env.JWT_SECRET || 'ultracoach_dev_secret_change_in_prod';

function requireAuth(req, res, next) {
  const token = req.cookies?.token
    || (req.headers.authorization?.startsWith('Bearer ') && req.headers.authorization.slice(7));

  if (!token) return res.status(401).json({ error: 'Non authentifié' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    // Injecte le userId dans AsyncLocalStorage pour getDb() et loadData()
    runWithUser(decoded.id, next);
  } catch {
    res.status(401).json({ error: 'Session expirée — reconnecte-toi' });
  }
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

module.exports = { requireAuth, signToken, JWT_SECRET };
