const bcrypt = require('bcryptjs');
const { getDB } = require('./models/db');
const fs = require('fs');
const path = require('path');

/**
 * Simple file-based mutex for synchronizing seed/reset operations.
 * Uses synchronous exclusive file creation — blocks briefly.
 */
function acquireLock(lockFile, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      // Exclusive create — fails if file already exists
      const fd = fs.openSync(lockFile, 'wx');
      fs.closeSync(fd);
      return () => { try { fs.unlinkSync(lockFile); } catch {} };
    } catch (e) {
      if (e.code === 'EEXIST') {
        // Lock held by another request — spin briefly
        // This is acceptable because seed() is fast (<50ms with WAL)
        continue;
      }
      throw e;
    }
  }
  throw new Error('Could not acquire seed lock after ' + timeoutMs + 'ms');
}

function seed() {
  const db = getDB();
  const lockFile = path.join(__dirname, '..', 'data', 'seed.lock');
  const release = acquireLock(lockFile);

  const doSeed = db.transaction(() => {
    // Clear existing data in FK-safe order
    db.exec('DELETE FROM order_items');
    db.exec('DELETE FROM orders');
    db.exec('DELETE FROM cart_items');
    db.exec('DELETE FROM products');
    db.exec('DELETE FROM users');

    // Reset autoincrement counters
    db.exec("DELETE FROM sqlite_sequence");

    // Demo users
    const customerHash = bcrypt.hashSync('customer123', 10);
    const adminHash = bcrypt.hashSync('admin123', 10);

    const insertUser = db.prepare(
      'INSERT INTO users (email, password, name, role) VALUES (?, ?, ?, ?)'
    );

    insertUser.run('customer@test.io', customerHash, 'Test Customer', 'customer');
    insertUser.run('admin@test.io', adminHash, 'Test Admin', 'admin');

    // Seed products
    const products = [
      { name: 'Wireless Mouse', category: 'electronics', price: 29.99, stock: 50, desc: 'Ergonomic wireless mouse with USB receiver. 1600 DPI optical sensor.' },
      { name: 'Mechanical Keyboard', category: 'electronics', price: 89.99, stock: 30, desc: 'RGB mechanical keyboard with Cherry MX Blue switches. Full-size layout.' },
      { name: 'USB-C Hub', category: 'electronics', price: 34.99, stock: 75, desc: '7-in-1 USB-C hub with HDMI, USB 3.0, SD card reader.' },
      { name: 'Laptop Stand', category: 'accessories', price: 39.99, stock: 40, desc: 'Adjustable aluminum laptop stand. Ergonomic elevation for desk setup.' },
      { name: 'Noise Cancelling Headphones', category: 'electronics', price: 199.99, stock: 20, desc: 'Over-ear Bluetooth headphones with active noise cancellation.' },
      { name: 'Webcam 1080p', category: 'electronics', price: 59.99, stock: 35, desc: 'Full HD 1080p webcam with built-in microphone and privacy shutter.' },
      { name: 'Mouse Pad XL', category: 'accessories', price: 19.99, stock: 100, desc: 'Large cloth mouse pad with stitched edges. 900x400mm.' },
      { name: 'Desk Organizer', category: 'accessories', price: 24.99, stock: 60, desc: 'Wooden desk organizer with pen holder, phone stand, and drawer.' },
      { name: 'Monitor Arm', category: 'accessories', price: 49.99, stock: 25, desc: 'Single monitor arm for 17-32 inch screens. VESA compatible.' },
      { name: 'Bluetooth Speaker', category: 'electronics', price: 44.99, stock: 45, desc: 'Portable Bluetooth 5.0 speaker with 12-hour battery life.' },
      { name: 'Ergonomic Office Chair', category: 'furniture', price: 349.99, stock: 10, desc: 'Mesh back ergonomic chair with lumbar support and adjustable armrests.' },
      { name: 'Standing Desk Converter', category: 'furniture', price: 179.99, stock: 15, desc: 'Height-adjustable standing desk converter. Fits dual monitors.' },
      { name: 'Cable Management Kit', category: 'accessories', price: 14.99, stock: 200, desc: 'Cable clips, velcro ties, and cable sleeve for desk cable management.' },
      { name: 'Portable SSD 1TB', category: 'electronics', price: 109.99, stock: 30, desc: 'USB-C portable SSD. 1TB storage. 1050MB/s read speed.' },
      { name: 'Ring Light', category: 'accessories', price: 32.99, stock: 55, desc: '10-inch LED ring light with tripod stand and phone holder.' },
    ];

    const insertProduct = db.prepare(
      'INSERT INTO products (name, slug, description, price, category, stock) VALUES (?, ?, ?, ?, ?, ?)'
    );

    for (const p of products) {
      const slug = p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      insertProduct.run(p.name, slug, p.desc, p.price, p.category, p.stock);
    }

    // Create a sample order for customer
    const customer = db.prepare('SELECT id FROM users WHERE email = ?').get('customer@test.io');
    if (customer) {
      // Get product IDs that were just inserted
      const insertOrder = db.prepare(
        'INSERT INTO orders (user_id, status, total, shipping_name, shipping_address, shipping_city, shipping_zip) VALUES (?, ?, ?, ?, ?, ?, ?)'
      );
      const result = insertOrder.run(customer.id, 'delivered', 124.97, 'Test Customer', '123 Test Street', 'Baku', 'AZ1000');
      const orderId = result.lastInsertRowid;

      const insertItem = db.prepare(
        'INSERT INTO order_items (order_id, product_id, product_name, price, quantity) VALUES (?, ?, ?, ?, ?)'
      );

      // Look up product IDs by name
      const prod1 = db.prepare('SELECT id FROM products WHERE name = ?').get('Wireless Mouse');
      const prod2 = db.prepare('SELECT id FROM products WHERE name = ?').get('Mechanical Keyboard');
      const prod8 = db.prepare('SELECT id FROM products WHERE name = ?').get('Desk Organizer');

      insertItem.run(orderId, prod1.id, 'Wireless Mouse', 29.99, 1);
      insertItem.run(orderId, prod2.id, 'Mechanical Keyboard', 89.99, 1);
      insertItem.run(orderId, prod8.id, 'Desk Organizer', 24.99, 1);
    }
  });

  try {
    doSeed();
    console.log('Database seeded successfully');
  } finally {
    release();
  }
  console.log('Demo accounts:');
  console.log('  Customer: customer@test.io / customer123');
  console.log('  Admin:    admin@test.io / admin123');
}

module.exports = { seed };
