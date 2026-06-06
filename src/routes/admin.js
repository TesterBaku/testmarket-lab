const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware');
const { getDB } = require('../models/db');

// All admin routes require admin role
router.use(requireAdmin);

/**
 * Helper: generate a URL-friendly slug from a string.
 */
function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ────────────────────────────────────────────────────────────────────────────
// Dashboard
// ────────────────────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const db = getDB();

  const productCount = db.prepare('SELECT COUNT(*) AS count FROM products').get().count;
  const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  const orderCount = db.prepare('SELECT COUNT(*) AS count FROM orders').get().count;

  const ordersByStatus = {
    pending: db.prepare("SELECT COUNT(*) AS count FROM orders WHERE status = 'pending'").get().count,
    confirmed: db.prepare("SELECT COUNT(*) AS count FROM orders WHERE status = 'confirmed'").get().count,
    shipped: db.prepare("SELECT COUNT(*) AS count FROM orders WHERE status = 'shipped'").get().count,
    delivered: db.prepare("SELECT COUNT(*) AS count FROM orders WHERE status = 'delivered'").get().count,
    cancelled: db.prepare("SELECT COUNT(*) AS count FROM orders WHERE status = 'cancelled'").get().count,
  };

  const recentOrders = db.prepare(`
    SELECT o.id, o.user_id, o.status, o.total, o.created_at, u.name AS user_name
    FROM orders o
    LEFT JOIN users u ON o.user_id = u.id
    ORDER BY o.created_at DESC
    LIMIT 5
  `).all();

  res.render('admin/dashboard', {
    title: 'Admin Dashboard',
    productCount,
    userCount,
    orderCount,
    ordersByStatus,
    recentOrders,
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Products
// ────────────────────────────────────────────────────────────────────────────
router.get('/products', (req, res) => {
  const db = getDB();
  const products = db.prepare('SELECT * FROM products ORDER BY name').all();

  res.render('admin/products', {
    title: 'Products',
    products,
  });
});

router.get('/products/new', (req, res) => {
  res.render('admin/product-form', {
    title: 'New Product',
    product: null,
  });
});

router.post('/products', (req, res) => {
  const { name, price, category, stock, description } = req.body;

  // Validate required fields
  if (!name || !name.trim()) {
    req.session.flash = { error: 'Product name is required.' };
    return res.redirect('/admin/products/new');
  }
  if (!price || isNaN(parseFloat(price)) || parseFloat(price) < 0) {
    req.session.flash = { error: 'A valid price is required.' };
    return res.redirect('/admin/products/new');
  }
  if (!category || !category.trim()) {
    req.session.flash = { error: 'Category is required.' };
    return res.redirect('/admin/products/new');
  }
  if (stock === undefined || stock === '' || isNaN(parseInt(stock)) || parseInt(stock) < 0) {
    req.session.flash = { error: 'A valid stock count is required.' };
    return res.redirect('/admin/products/new');
  }

  const db = getDB();
  const slug = slugify(name);

  db.prepare(`
    INSERT INTO products (name, slug, description, price, category, stock)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    name.trim(),
    slug,
    (description || '').trim(),
    parseFloat(price),
    category.trim(),
    parseInt(stock),
  );

  req.session.flash = { success: 'Product created successfully.' };
  res.redirect('/admin/products');
});

router.get('/products/:id/edit', (req, res) => {
  const db = getDB();
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(parseInt(req.params.id));

  if (!product) {
    req.session.flash = { error: 'Product not found.' };
    return res.redirect('/admin/products');
  }

  res.render('admin/product-form', {
    title: 'Edit Product',
    product,
  });
});

router.post('/products/:id/edit', (req, res) => {
  const id = parseInt(req.params.id);
  if (!id || isNaN(id)) {
    req.session.flash = { error: 'Invalid product ID.' };
    return res.redirect('/admin/products');
  }

  const { name, price, category, stock, description } = req.body;

  if (!name || !name.trim()) {
    req.session.flash = { error: 'Product name is required.' };
    return res.redirect(`/admin/products/${id}/edit`);
  }
  if (!price || isNaN(parseFloat(price)) || parseFloat(price) < 0) {
    req.session.flash = { error: 'A valid price is required.' };
    return res.redirect(`/admin/products/${id}/edit`);
  }
  if (!category || !category.trim()) {
    req.session.flash = { error: 'Category is required.' };
    return res.redirect(`/admin/products/${id}/edit`);
  }
  if (stock === undefined || stock === '' || isNaN(parseInt(stock)) || parseInt(stock) < 0) {
    req.session.flash = { error: 'A valid stock count is required.' };
    return res.redirect(`/admin/products/${id}/edit`);
  }

  const db = getDB();
  const slug = slugify(name);

  const result = db.prepare(`
    UPDATE products
    SET name = ?, slug = ?, description = ?, price = ?, category = ?, stock = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    name.trim(),
    slug,
    (description || '').trim(),
    parseFloat(price),
    category.trim(),
    parseInt(stock),
    id,
  );

  if (result.changes === 0) {
    req.session.flash = { error: 'Product not found.' };
    return res.redirect('/admin/products');
  }

  req.session.flash = { success: 'Product updated successfully.' };
  res.redirect('/admin/products');
});

router.post('/products/:id/delete', (req, res) => {
  const id = parseInt(req.params.id);
  if (!id || isNaN(id)) {
    req.session.flash = { error: 'Invalid product ID.' };
    return res.redirect('/admin/products');
  }

  const db = getDB();
  const result = db.prepare('DELETE FROM products WHERE id = ?').run(id);

  if (result.changes === 0) {
    req.session.flash = { error: 'Product not found.' };
    return res.redirect('/admin/products');
  }

  req.session.flash = { success: 'Product deleted successfully.' };
  res.redirect('/admin/products');
});

// ────────────────────────────────────────────────────────────────────────────
// Users
// ────────────────────────────────────────────────────────────────────────────
router.get('/users', (req, res) => {
  const db = getDB();
  const users = db.prepare('SELECT id, email, name, role, created_at FROM users ORDER BY created_at DESC').all();

  res.render('admin/users', {
    title: 'Users',
    users,
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Orders
// ────────────────────────────────────────────────────────────────────────────
router.get('/orders', (req, res) => {
  const db = getDB();
  const orders = db.prepare(`
    SELECT o.*, u.name AS user_name
    FROM orders o
    LEFT JOIN users u ON o.user_id = u.id
    ORDER BY o.created_at DESC
  `).all();

  res.render('admin/orders', {
    title: 'Orders',
    orders,
  });
});

const VALID_STATUSES = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];

router.post('/orders/:id/status', (req, res) => {
  const id = parseInt(req.params.id);
  if (!id || isNaN(id)) {
    req.session.flash = { error: 'Invalid order ID.' };
    return res.redirect('/admin/orders');
  }

  const { status } = req.body;

  if (!status || !VALID_STATUSES.includes(status)) {
    req.session.flash = { error: 'Invalid status. Valid statuses: ' + VALID_STATUSES.join(', ') };
    return res.redirect('/admin/orders');
  }

  const db = getDB();
  const result = db.prepare(`
    UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?
  `).run(status, id);

  if (result.changes === 0) {
    req.session.flash = { error: 'Order not found.' };
    return res.redirect('/admin/orders');
  }

  req.session.flash = { success: `Order #${id} status updated to "${status}".` };
  res.redirect('/admin/orders');
});

module.exports = router;
