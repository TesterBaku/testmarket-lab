require('dotenv').config();

const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');
const { initDB, getDB } = require('./models/db');
const { getSessionId } = require('./middleware');
const { seed } = require('./seed');

const app = express();
const PORT = process.env.PORT || 3000;

// --- View engine ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

// --- Static files ---
app.use(express.static(path.join(__dirname, '..', 'public')));

// --- Body parsing ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// --- Session ---
const SQLiteStore = require('connect-sqlite3')(session);
app.use(session({
  store: new SQLiteStore({ db: 'sessions.db', dir: path.join(__dirname, '..', 'data') }),
  secret: process.env.JWT_SECRET || 'testmarket-lab-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// --- Make user available in all views ---
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.path = req.path;
  res.locals.query = req.query;
  res.locals.error = null;
  res.locals.success = null;
  res.locals.csrfToken = 'not-implemented'; // placeholder for future
  next();
});

// --- Flash messages via session ---
app.use((req, res, next) => {
  if (req.session.flash) {
    res.locals.success = req.session.flash.success || null;
    res.locals.error = req.session.flash.error || null;
    req.session.flash = {};
  } else {
    req.session.flash = {};
  }
  next();
});

// --- Cart item count for nav ---
app.use((req, res, next) => {
  try {
    const sessionId = getSessionId(req);
    const db = getDB();
    const result = db.prepare(
      'SELECT COALESCE(SUM(quantity), 0) as count FROM cart_items WHERE session_id = ?'
    ).get(sessionId);
    res.locals.cartItems = result ? result.count : 0;
  } catch {
    res.locals.cartItems = 0;
  }
  next();
});

// --- Routes ---
const shopRoutes = require('./routes/shop');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const apiRoutes = require('./routes/api');

app.use('/', shopRoutes);
app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);
app.use('/api', apiRoutes);

// --- 404 ---
app.use((req, res) => {
  res.status(404).render('404', { title: 'Page Not Found' });
});

// --- Error handler ---
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).render('500', {
    title: 'Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong.'
  });
});

// --- Init DB and seed data ---
initDB();
seed();

app.listen(PORT, () => {
  console.log(`TestMarket Lab running at http://localhost:${PORT}`);
});

module.exports = app;
