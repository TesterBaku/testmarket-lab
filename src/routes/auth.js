const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { requireAuth } = require('../middleware');
const { getDB } = require('../models/db');

// GET /auth/register — render registration form
router.get('/register', (req, res) => {
  res.render('auth/register');
});

// POST /auth/register — handle registration
router.post('/register', (req, res) => {
  const { name, email, password } = req.body;

  // Validate required fields
  if (!name || !name.trim()) {
    res.locals.error = 'Name is required.';
    return res.render('auth/register');
  }
  if (!email || !email.trim()) {
    res.locals.error = 'Email is required.';
    return res.render('auth/register');
  }
  if (!password || password.length < 6) {
    res.locals.error = 'Password must be at least 6 characters.';
    return res.render('auth/register');
  }

  const db = getDB();

  // Check if email already exists
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.trim().toLowerCase());
  if (existing) {
    res.locals.error = 'An account with this email already exists.';
    return res.render('auth/register');
  }

  // Hash the password
  const hashedPassword = bcrypt.hashSync(password, 10);

  // Insert the new user with role='customer'
  const result = db.prepare(
    'INSERT INTO users (email, password, name, role) VALUES (?, ?, ?, ?)'
  ).run(email.trim().toLowerCase(), hashedPassword, name.trim(), 'customer');

  // Set session user
  req.session.user = {
    id: result.lastInsertRowid,
    name: name.trim(),
    email: email.trim().toLowerCase(),
    role: 'customer'
  };

  req.session.flash = { success: 'Account created successfully! Welcome!' };
  res.redirect('/');
});

// GET /auth/login — render login form
router.get('/login', (req, res) => {
  res.render('auth/login');
});

// POST /auth/login — handle login
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !email.trim() || !password) {
    res.locals.error = 'Email and password are required.';
    return res.render('auth/login');
  }

  const db = getDB();

  // Find user by email
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());
  if (!user) {
    res.locals.error = 'Invalid email or password.';
    return res.render('auth/login');
  }

  // Compare password
  if (!bcrypt.compareSync(password, user.password)) {
    res.locals.error = 'Invalid email or password.';
    return res.render('auth/login');
  }

  // Set session user
  req.session.user = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role
  };

  req.session.flash = { success: 'Logged in successfully!' };

  // Redirect admin users to /admin, regular users to /
  if (user.role === 'admin') {
    return res.redirect('/admin');
  }
  res.redirect('/');
});

// POST /auth/logout — destroy session
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.redirect('/');
    }
    res.clearCookie('connect.sid');
    // Use a flash-like approach via query param since session is gone
    // We'll redirect to home — flash is lost with session destroy,
    // but we can set a temporary cookie or just rely on the redirect.
    res.redirect('/');
  });
});

// GET /auth/profile — show user profile with orders (requires auth)
router.get('/profile', requireAuth, (req, res) => {
  const db = getDB();
  const userId = req.session.user.id;

  const orders = db.prepare(
    'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC'
  ).all(userId);

  res.render('auth/profile', { orders });
});

module.exports = router;
