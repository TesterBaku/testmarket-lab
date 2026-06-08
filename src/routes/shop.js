const express = require('express');
const router = express.Router();
const { requireAuth, getSessionId, simulateDelay } = require('../middleware');
const { getDB } = require('../models/db');

// GET / — Home page with products grouped by category
router.get('/', (req, res) => {
  const db = getDB();

  const products = db.prepare('SELECT * FROM products ORDER BY category, name').all();
  const categoryRows = db.prepare('SELECT DISTINCT category FROM products ORDER BY category').all();
  const categories = categoryRows.map(r => r.category);

  // Group products by category
  const grouped = {};
  for (const product of products) {
    if (!grouped[product.category]) {
      grouped[product.category] = [];
    }
    grouped[product.category].push(product);
  }

  res.render('shop/index', {
    title: 'TestMarket Lab',
    products: grouped,
    categories
  });
});

// GET /account — Alias that redirects to the profile page
router.get('/account', (req, res) => {
  res.redirect('/auth/profile');
});

// GET /products — Product listing with filtering, search, and sort
router.get('/products', simulateDelay(800), (req, res) => {
  const db = getDB();

  const { category, search, sort } = req.query;

  const categoryRows = db.prepare('SELECT DISTINCT category FROM products ORDER BY category').all();
  const categories = categoryRows.map(r => r.category);

  // Build dynamic query
  const conditions = [];
  const params = [];

  if (category) {
    conditions.push('category = ?');
    params.push(category);
  }

  if (search) {
    conditions.push('(name LIKE ? OR description LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like);
  }

  const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  let orderClause = 'ORDER BY name';
  if (sort === 'price_asc') {
    orderClause = 'ORDER BY price ASC';
  } else if (sort === 'price_desc') {
    orderClause = 'ORDER BY price DESC';
  } else if (sort === 'name') {
    orderClause = 'ORDER BY name';
  }

  const products = db.prepare(`SELECT * FROM products ${whereClause} ${orderClause}`).all(...params);

  res.render('shop/products', {
    title: 'Products',
    products,
    categories,
    currentCategory: category || '',
    search: search || '',
    sort: sort || ''
  });
});

// GET /products/:slug — Product detail page
router.get('/products/:slug', (req, res) => {
  const db = getDB();
  const product = db.prepare('SELECT * FROM products WHERE slug = ?').get(req.params.slug);

  if (!product) {
    return res.status(404).render('404', { title: 'Product Not Found' });
  }

  res.render('shop/product', {
    title: product.name,
    product
  });
});

// POST /cart/add — Add item to cart
router.post('/cart/add', (req, res) => {
  const db = getDB();
  const sessionId = getSessionId(req);
  const productId = parseInt(req.body.product_id);
  const quantity = parseInt(req.body.quantity) || 1;

  if (!productId || isNaN(productId)) {
    req.session.flash = { error: 'Invalid product.' };
    return res.redirect(req.get('Referer') || '/products');
  }

  // Check if item already exists in cart
  const existing = db.prepare(
    'SELECT id, quantity FROM cart_items WHERE session_id = ? AND product_id = ?'
  ).get(sessionId, productId);

  if (existing) {
    db.prepare('UPDATE cart_items SET quantity = quantity + ? WHERE id = ?')
      .run(quantity, existing.id);
  } else {
    db.prepare('INSERT INTO cart_items (session_id, product_id, quantity) VALUES (?, ?, ?)')
      .run(sessionId, productId, quantity);
  }

  req.session.flash = { success: 'Item added to cart.' };
  res.redirect(req.get('Referer') || '/products');
});

// POST /cart/update — Update cart item quantity
router.post('/cart/update', (req, res) => {
  const db = getDB();
  const itemId = parseInt(req.body.item_id);
  const quantity = parseInt(req.body.quantity);

  if (!itemId || isNaN(itemId) || isNaN(quantity)) {
    return res.redirect('/cart');
  }

  if (quantity <= 0) {
    db.prepare('DELETE FROM cart_items WHERE id = ?').run(itemId);
  } else {
    db.prepare('UPDATE cart_items SET quantity = ? WHERE id = ?').run(quantity, itemId);
  }

  res.redirect('/cart');
});

// POST /cart/remove — Remove item from cart
router.post('/cart/remove', (req, res) => {
  const db = getDB();
  const itemId = parseInt(req.body.item_id);

  if (itemId && !isNaN(itemId)) {
    db.prepare('DELETE FROM cart_items WHERE id = ?').run(itemId);
  }

  res.redirect('/cart');
});

// GET /cart — Show cart contents
router.get('/cart', (req, res) => {
  const db = getDB();
  const sessionId = getSessionId(req);

  const cartItems = db.prepare(`
    SELECT ci.id, ci.product_id, ci.quantity, ci.created_at,
           p.name, p.slug, p.price, p.image_url, p.stock
    FROM cart_items ci
    JOIN products p ON ci.product_id = p.id
    WHERE ci.session_id = ?
    ORDER BY ci.created_at DESC
  `).all(sessionId);

  const total = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  res.render('shop/cart', {
    title: 'Cart',
    cartItems,
    total
  });
});

// GET /checkout — Show checkout form
router.get('/checkout', requireAuth, (req, res) => {
  res.render('shop/checkout', { title: 'Checkout' });
});

// POST /checkout — Process checkout
router.post('/checkout', requireAuth, (req, res) => {
  const db = getDB();
  const sessionId = getSessionId(req);
  const { shipping_name, shipping_address, shipping_city, shipping_zip } = req.body;

  // Validate required fields
  if (!shipping_name || !shipping_name.trim()) {
    res.locals.error = 'Shipping name is required.';
    return res.render('shop/checkout', { title: 'Checkout' });
  }
  if (!shipping_address || !shipping_address.trim()) {
    res.locals.error = 'Shipping address is required.';
    return res.render('shop/checkout', { title: 'Checkout' });
  }
  if (!shipping_city || !shipping_city.trim()) {
    res.locals.error = 'Shipping city is required.';
    return res.render('shop/checkout', { title: 'Checkout' });
  }
  if (!shipping_zip || !shipping_zip.trim()) {
    res.locals.error = 'Shipping ZIP code is required.';
    return res.render('shop/checkout', { title: 'Checkout' });
  }

  // Get cart items
  const cartItems = db.prepare(`
    SELECT ci.id, ci.product_id, ci.quantity,
           p.name, p.price
    FROM cart_items ci
    JOIN products p ON ci.product_id = p.id
    WHERE ci.session_id = ?
  `).all(sessionId);

  if (cartItems.length === 0) {
    req.session.flash = { error: 'Your cart is empty.' };
    return res.redirect('/cart');
  }

  // Calculate total
  const total = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  // Create order in a transaction
  const insertOrder = db.prepare(`
    INSERT INTO orders (user_id, session_id, status, total, shipping_name, shipping_address, shipping_city, shipping_zip)
    VALUES (?, ?, 'pending', ?, ?, ?, ?, ?)
  `);
  const insertOrderItem = db.prepare(`
    INSERT INTO order_items (order_id, product_id, product_name, price, quantity)
    VALUES (?, ?, ?, ?, ?)
  `);
  const clearCart = db.prepare('DELETE FROM cart_items WHERE session_id = ?');

  const transaction = db.transaction(() => {
    const result = insertOrder.run(
      req.session.user.id,
      sessionId,
      total,
      shipping_name.trim(),
      shipping_address.trim(),
      shipping_city.trim(),
      shipping_zip.trim()
    );
    const orderId = result.lastInsertRowid;

    for (const item of cartItems) {
      insertOrderItem.run(orderId, item.product_id, item.name, item.price, item.quantity);
    }

    clearCart.run(sessionId);

    return orderId;
  });

  const orderId = transaction();

  req.session.flash = { success: 'Order placed successfully!' };
  res.redirect(`/orders/${orderId}`);
});

// GET /orders/:id — Order confirmation / detail
router.get('/orders/:id', (req, res) => {
  const db = getDB();
  const orderId = parseInt(req.params.id);

  if (!orderId || isNaN(orderId)) {
    return res.status(404).render('404', { title: 'Order Not Found' });
  }

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) {
    return res.status(404).render('404', { title: 'Order Not Found' });
  }

  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);

  res.render('shop/order', {
    title: 'Order Confirmation',
    order,
    items
  });
});

// GET /orders — Order history
router.get('/orders', requireAuth, (req, res) => {
  const db = getDB();
  const orders = db.prepare(
    'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC'
  ).all(req.session.user.id);

  res.render('shop/orders', {
    title: 'My Orders',
    orders
  });
});

module.exports = router;
