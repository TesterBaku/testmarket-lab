# TestMarket Lab

A training e-commerce and admin application for the Azerbaijani Playwright Automation Course. Learners use this app to practice UI automation, API testing, authentication, and more.

## Requirements

- **Node.js 20 or newer** (works on the current LTS, including Node 24). Verify with `node -v`.

## Quick Start

```bash
# Install dependencies
npm install

# Start the server
npm start

# Or start in dev mode (auto-restart on changes)
npm run dev
```

Open **http://localhost:3000** in your browser.

## Demo Accounts

| Role     | Email              | Password      |
|----------|--------------------|---------------|
| Customer | customer@test.io   | customer123   |
| Admin    | admin@test.io      | admin123      |

## Reset Data

To reset the database to its initial seed state:

```bash
npm run reset
```

Or via the API (useful for Playwright test setup):

```bash
curl -X POST http://localhost:3000/api/reset
```

## App Areas

### Public Shop
- **Home page** — Products grouped by category
- **Product listing** — Filter by category, search, sort by price/name
- **Product detail** — View details and add to cart
- **Shopping cart** — Update quantities, remove items
- **Checkout** — Shipping form with validation
- **Order confirmation** — View order details after placing

### Customer Authentication
- Register a new account
- Login / Logout
- Profile page with order history

### Admin Area (requires admin login)
- **Dashboard** — Overview with product/user/order counts
- **Manage Products** — Create, edit, delete products
- **Manage Users** — View registered users
- **Manage Orders** — View orders and update status

### API Endpoints (for test automation)
All endpoints return JSON.

| Method | Endpoint              | Description                  |
|--------|-----------------------|------------------------------|
| POST   | /api/auth/login       | API login                    |
| POST   | /api/auth/register    | API register                 |
| GET    | /api/products         | List products (?category, ?search) |
| GET    | /api/products/:id     | Get single product           |
| POST   | /api/products         | Create product               |
| PUT    | /api/products/:id     | Update product               |
| DELETE | /api/products/:id     | Delete product               |
| GET    | /api/orders           | List all orders              |
| GET    | /api/users            | List all users               |
| GET    | /api/cart             | Get current cart             |
| POST   | /api/reset            | Reset database to seed state |

## Tech Stack

- **Runtime:** Node.js
- **Framework:** Express
- **Templating:** EJS
- **Database:** SQLite (via better-sqlite3)
- **Auth:** Session-based (express-session + SQLite store)
- **Password hashing:** bcryptjs

No build step required. Clone, install, and run.

## UI States for Automation Practice

The app includes intentionally designed states for teaching:

- **Loading state** — Product listing has a simulated 800ms delay
- **Empty state** — Empty cart, no orders, no products
- **Validation errors** — Form validation on registration, login, checkout
- **Success messages** — Toast-style flash messages after actions
- **Error state** — 404 and 500 error pages
- **Role-based access** — Customer vs admin areas

## Project Structure

```
capstone-app/
├── data/               # SQLite database files
├── public/
│   ├── css/
│   └── js/
├── src/
│   ├── middleware/     # Auth, session, delay helpers
│   ├── models/         # Database initialization
│   ├── routes/         # Express route handlers
│   │   ├── auth.js     # Registration, login, logout, profile
│   │   ├── shop.js     # Home, products, cart, checkout, orders
│   │   ├── admin.js    # Dashboard, product CRUD, users, orders
│   │   └── api.js      # REST API for test automation
│   ├── seed.js         # Database seeding
│   ├── reset.js        # CLI reset script
│   └── server.js       # Express app entry point
├── views/
│   ├── partials/       # Shared partials (head, header, footer, flash)
│   ├── shop/           # Public shop pages
│   ├── auth/           # Login, register, profile
│   └── admin/          # Dashboard, product management, users, orders
├── .env                # Environment variables
├── package.json
└── README.md
```
