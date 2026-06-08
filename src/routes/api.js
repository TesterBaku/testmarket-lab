const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getDB } = require('../models/db');
const { seed } = require('../seed');
const { getSessionId } = require('../middleware');

// ============================================================
// Test Automation API Endpoints
// These support Playwright tests for data setup, cleanup,
// and verification without going through the UI.
// ============================================================

/**
 * POST /api/auth/login
 * API login — returns user data (no session/cookie needed).
 * Useful for API-based test setup.
 */
router.post('/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const db = getDB();
  const user = db.prepare('SELECT id, email, name, role FROM users WHERE email = ?').get(email);

  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const dbUser = db.prepare('SELECT password FROM users WHERE id = ?').get(user.id);
  const valid = bcrypt.compareSync(password, dbUser.password);

  if (!valid) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  res.json({ id: user.id, email: user.email, name: user.name, role: user.role });
});

/**
 * POST /api/auth/register
 * API register — creates a customer user, returns user data.
 */
router.post('/auth/register', (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const db = getDB();

  // Check duplicate email
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    return res.status(409).json({ error: 'Email already registered' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare(
    'INSERT INTO users (email, password, name, role) VALUES (?, ?, ?, ?)'
  ).run(email, hash, name, 'customer');

  res.status(201).json({
    id: result.lastInsertRowid,
    email,
    name,
    role: 'customer'
  });
});

/**
 * GET /api/products
 * List all products. Supports ?category and ?search query params.
 */
router.get('/products', (req, res) => {
  const db = getDB();
  let query = 'SELECT * FROM products';
  const params = [];
  const conditions = [];

  if (req.query.category) {
    conditions.push('category = ?');
    params.push(req.query.category);
  }

  if (req.query.search) {
    conditions.push('(name LIKE ? OR description LIKE ?)');
    const term = `%${req.query.search}%`;
    params.push(term, term);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY name ASC';

  const products = db.prepare(query).all(...params);
  res.json(products);
});

/**
 * GET /api/products/:id
 * Get single product by id.
 */
router.get('/products/:id', (req, res) => {
  const db = getDB();
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(parseInt(req.params.id));
  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }
  res.json(product);
});

/**
 * POST /api/products
 * Create product (admin-like, no auth check for test convenience).
 */
router.post('/products', (req, res) => {
  const { name, price, category, stock, description } = req.body;

  if (!name || price == null) {
    return res.status(400).json({ error: 'Name and price are required' });
  }

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const db = getDB();

  const result = db.prepare(
    'INSERT INTO products (name, slug, description, price, category, stock) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(name, slug, description || '', parseFloat(price), category || 'general', parseInt(stock) || 0);

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(product);
});

/**
 * PUT /api/products/:id
 * Update product.
 */
router.put('/products/:id', (req, res) => {
  const db = getDB();
  const { name, price, category, stock, description } = req.body;

  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(parseInt(req.params.id));
  if (!existing) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const slug = name
    ? name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    : existing.slug;

  db.prepare(
    'UPDATE products SET name = ?, slug = ?, description = ?, price = ?, category = ?, stock = ?, updated_at = datetime(\'now\') WHERE id = ?'
  ).run(
    name || existing.name,
    slug,
    description != null ? description : existing.description,
    price != null ? parseFloat(price) : existing.price,
    category || existing.category,
    stock != null ? parseInt(stock) : existing.stock,
    parseInt(req.params.id)
  );

  const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(parseInt(req.params.id));
  res.json(updated);
});

/**
 * DELETE /api/products/:id
 * Delete product.
 */
router.delete('/products/:id', (req, res) => {
  const db = getDB();
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(parseInt(req.params.id));
  if (!existing) {
    return res.status(404).json({ error: 'Product not found' });
  }

  db.prepare('DELETE FROM products WHERE id = ?').run(parseInt(req.params.id));
  res.json({ message: 'Product deleted', id: parseInt(req.params.id) });
});

/**
 * GET /api/orders
 * List all orders with user name.
 */
router.get('/orders', (req, res) => {
  const db = getDB();
  const orders = db.prepare(`
    SELECT o.*, u.name as user_name, u.email as user_email
    FROM orders o
    LEFT JOIN users u ON o.user_id = u.id
    ORDER BY o.created_at DESC
  `).all();
  res.json(orders);
});

/**
 * GET /api/users
 * List all users (without passwords).
 */
router.get('/users', (req, res) => {
  const db = getDB();
  const users = db.prepare('SELECT id, email, name, role, created_at FROM users ORDER BY created_at DESC').all();
  res.json(users);
});

/**
 * GET /api/cart
 * Get cart items for current session.
 */
router.get('/cart', (req, res) => {
  const sessionId = getSessionId(req);
  const db = getDB();
  const items = db.prepare(`
    SELECT ci.*, p.name, p.price, p.image_url, p.slug
    FROM cart_items ci
    JOIN products p ON ci.product_id = p.id
    WHERE ci.session_id = ?
  `).all(sessionId);

  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  res.json({ items, total, itemCount: items.reduce((s, i) => s + i.quantity, 0) });
});

/**
 * POST /api/reset
 * Reset the database to seed state. Destroys all test data.
 * Useful for Playwright test setup in beforeEach hooks.
 */
function resetHandler(req, res) {
  try {
    seed();
    res.json({ message: 'Database reset successful' });
  } catch (err) {
    console.error('Reset error:', err);
    res.status(500).json({ error: 'Reset failed', details: err.message });
  }
}

router.post('/reset', resetHandler);

/**
 * POST /api/test/reset
 * Alias of POST /api/reset for test convenience.
 */
router.post('/test/reset', resetHandler);

module.exports = router;
