/**
 * Require authenticated user.
 */
function requireAuth(req, res, next) {
  if (!req.session.user) {
    req.session.flash = { error: 'Please log in first.' };
    return res.redirect('/auth/login');
  }
  next();
}

/**
 * Require admin role.
 */
function requireAdmin(req, res, next) {
  if (!req.session.user) {
    req.session.flash = { error: 'Please log in first.' };
    return res.redirect('/auth/login');
  }
  if (req.session.user.role !== 'admin') {
    req.session.flash = { error: 'Access denied. Admins only.' };
    return res.redirect('/');
  }
  next();
}

/**
 * Delay middleware — simulates slow API for specific routes.
 * Add ?delay=2000 to any route to simulate a slow response.
 */
function simulateDelay(ms) {
  return (req, res, next) => {
    const delay = parseInt(req.query.delay) || ms || 0;
    if (delay > 0) {
      return setTimeout(next, Math.min(delay, 5000));
    }
    next();
  };
}

/**
 * Generate a simple session ID for cart tracking.
 */
function getSessionId(req) {
  if (req.session.user) return `user_${req.session.user.id}`;
  if (!req.session.cartId) {
    req.session.cartId = `anon_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
  return req.session.cartId;
}

module.exports = { requireAuth, requireAdmin, simulateDelay, getSessionId };
