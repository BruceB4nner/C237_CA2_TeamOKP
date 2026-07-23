const express = require('express');
const mysql = require('mysql2');
const app = express();
const multer = require('multer');
const session = require('express-session');
const flash = require('connect-flash');

// Multer Storage Setup
const storage = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, 'public/images'); },
    filename: (req, file, cb) => { cb(null, file.originalname); }
});
const upload = multer({ storage: storage });

// Azure MySQL Connection
const connection = mysql.createConnection({
    host: 'c237-eaint-mysql.mysql.database.azure.com',
    user: 'c237_029',
    password: 'c237029@2026!',
    database: 'c237_029_teamongkaipeng',
    ssl: { rejectUnauthorized: true }
});

connection.connect((err) => {
    if (err) {
        console.error('Error connecting to MySQL:', err);
        return;
    }
    console.log('Connected to MySQL database');
});

app.set('view engine', 'ejs');

// Enable static files
app.use(express.static('public'));

// Enable form processing
app.use(express.urlencoded({ extended: false }));

// Session + Flash setup
app.use(session({
    secret: 'someSecretKeyChangeMe',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 } // 1 week session
}));
app.use(flash());

// Middleware to track session globally across views
app.use((req, res, next) => {
    res.locals.user = req.session.user;
    next();
});

// Authentication middleware check
function checkAuthenticated(req, res, next) {
    if (req.session.user) {
        return next();
    }
    res.redirect('/login');
}

// Only lets the request through if logged-in user owns this product, or is an admin
function isOwnerOrAdmin(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login');
  }

  const productId = req.params.id;
  const sql = 'SELECT * FROM products WHERE productId = ?';

  connection.query(sql, [productId], (err, results) => {
    if (err) {
      console.error('Database query error:', err);
      return res.status(500).send('Server error');
    }
    if (results.length === 0) {
      return res.status(404).send('Product not found');
    }

    const product = results[0];
    const isOwner = product.userId === req.session.user.id;
    const isAdminUser = req.session.user.role === 'admin';

    if (!isOwner && !isAdminUser) {
      return res.status(403).send('Forbidden: You can only edit or delete your own products');
    }

    req.product = product;
    next();
  });
}

// Categories array used across routes (Ning Xin)
const CATEGORIES = [
    'toys & collectibles',
    'computers & tech',
    "women's fashion",
    "men's fashion",
    'video gaming',
    'furniture & home living',
    'sports & wellness',
    'tickets & vouchers',
    'others'
];

// Helper Middleware (Josh)
function isAdmin(req, res, next) {
    if (req.session.user && req.session.user.role === 'admin') {
        return next();
    }
    res.status(403).send('Forbidden: Admins only');
}

const validateRegistration = (req, res, next) => {
    const { username, email, password, address, contact } = req.body;
    if (!username || !email || !password || !address || !contact) {
        return res.send('All fields are required.');
    }
    if (password.length < 6) {
        req.flash('error', 'Password should be at least 6 or more characters long');
        req.flash('formData', req.body);
        return res.redirect('/register');
    }
    next();
};

// ==========================================
// NING XIN: HOMEPAGE ROUTE (Carousel + Reviews + Categories)
// ==========================================
app.get('/', (req, res) => {
    const sqlProducts = 'SELECT * FROM products WHERE stock > 0';
    const sqlReviews = `
        SELECT r.*, u.username, p.productName AS product_name 
        FROM reviews r 
        JOIN users u ON r.user_id = u.id 
        JOIN products p ON r.product_id = p.productId 
        LIMIT 4
    `;

    connection.query(sqlProducts, (err, products) => {
        if (err) {
            console.error('Error fetching products for homepage:', err);
            products = [];
        }

        connection.query(sqlReviews, (err, reviews) => {
            if (err) {
                reviews = [];
            }

            res.render('index', {
                user: req.session.user,
                messages: req.flash('success'),
                products: products || [],
                reviews: reviews || [],
                categories: CATEGORIES
            });
        });
    });
});

// ==========================================
// NING XIN: PRODUCT VIEWING, CATEGORY FILTERING, SORTING & PRICE RANGE
// ==========================================
app.get('/products', (req, res) => {
    let sql = "SELECT * FROM products WHERE 1=1";
    let params = [];

    const category = req.query.category || '';
    const minPrice = req.query.minPrice || '';
    const maxPrice = req.query.maxPrice || '';
    const sort = req.query.sort || '';

    // Append Category filter
    if (category.trim() !== '') {
        sql += " AND category = ?";
        params.push(category);
    }

    // Append Min Price filter
    if (minPrice.trim() !== '') {
        sql += " AND price >= ?";
        params.push(parseFloat(minPrice));
    }

    // Append Max Price filter
    if (maxPrice.trim() !== '') {
        sql += " AND price <= ?";
        params.push(parseFloat(maxPrice));
    }

    // Append Sorting
    if (sort === 'price_asc') {
        sql += " ORDER BY price ASC";
    } else if (sort === 'price_desc') {
        sql += " ORDER BY price DESC";
    } else if (sort === 'newest') {
        sql += " ORDER BY productId DESC";
    }

    // Execute query using connection
    connection.query(sql, params, (err, results) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).send("Server Error");
        }

        res.render('products', {
            products: results,
            selectedCategory: category,
            selectedSort: sort,
            minPrice: minPrice,
            maxPrice: maxPrice,
            user: req.session.user || null
        });
    });
});

// ==========================================
// AUTHENTICATION ROUTES (Josh)
// ==========================================

app.get('/register', (req, res) => {
    res.render('register', { messages: req.flash('error'), formData: req.flash('formData')[0] });
});

app.post('/register', validateRegistration, (req, res) => {
    const { username, email, password, address, contact, role } = req.body;

    const sql = 'INSERT INTO users (username, email, password, address, contact, role) VALUES (?, ?, SHA2(?, 256), ?, ?, ?)';
    connection.query(sql, [username, email, password, address, contact, role], (err, result) => {
        if (err) throw err;
        req.flash('success', 'Registration successful! Please log in.');
        res.redirect('/login');
    });
});

app.get('/login', (req, res) => {
    res.render('login', {
        messages: req.flash('success'),
        errors: req.flash('error')
    });
});

app.post('/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        req.flash('error', 'All fields are required.');
        return res.redirect('/login');
    }

    const sql = 'SELECT * FROM users WHERE email = ? AND password = SHA2(?,256)';
    connection.query(sql, [email, password], (err, results) => {
        if (err) throw err;

        if (results.length > 0) {
            req.session.user = results[0];
            req.flash('success', 'Login successful!');
            res.redirect('/');
        } else {
            req.flash('error', 'Invalid email or password.');
            res.redirect('/login');
        }
    });
});

app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) return res.redirect('/');
        res.redirect('/');
    });
});

// 1. Single product route (ensure it renders 'product')
app.get('/products/:id', (req, res) => {
    const productId = req.params.id;
    const sql = 'SELECT * FROM products WHERE productId = ?';

    connection.query(sql, [productId], (err, results) => {
        if (err) throw err;

        if (results.length === 0) {
            return res.status(404).send('Product not found');
        }

        const product = results[0];
        res.render('product', { product, user: req.session.user });
    });
});


app.get('/addProduct', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    res.render('addProducts', {
        user: req.session.user
    });
});

app.post('/addProduct', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    const { productName, category, description, quantity, price, image } = req.body;
    const userId = req.session.user.userId;

    const sql = `
        INSERT INTO products
        (productName, category, description, quantity, price, image, stock, userId)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?)
    `;

    connection.query(
        sql,
        [productName, category, description, quantity, price, image, userId],
        (err) => {
            if (err) throw err;
            res.redirect('/products');
        }
    );
});

// wishlist routes (myiesha)
app.post('/wishlist/add/:id', checkAuthenticated, (req, res) => {
    const userId = req.session.user.id;
    const productId = req.params.id;

    const sql = `
        INSERT IGNORE INTO wishlist(user_id, product_id)
        VALUES (?, ?)
    `;

    connection.query(sql, [userId, productId], (err) => {
        if (err) throw err;
        res.redirect('/products');
    });
});

app.get('/wishlist', checkAuthenticated, (req, res) => {
    const userId = req.session.user.id;

    const sql = `
        SELECT products.*
        FROM wishlist
        JOIN products
        ON wishlist.product_id = products.id
        WHERE wishlist.user_id = ?
    `;

    connection.query(sql, [userId], (err, results) => {
        if (err) throw err;
        res.render('wishlist', {
            products: results
        });
    });
});

app.post('/wishlist/delete/:id', checkAuthenticated, (req, res) => {
    const sql = `
        DELETE FROM wishlist
        WHERE product_id = ?
        AND user_id = ?
    `;

    connection.query(sql, [req.params.id, req.session.user.id], (err) => {
        if (err) throw err;
        res.redirect('/wishlist');
    });
});

// delete products
app.post('/products/delete/:id', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).send('Forbidden: Admins only');
    }

    const productId = req.params.id;
    connection.query('DELETE FROM products WHERE productId = ?', [productId], (err) => {
        if (err) throw err;
        req.flash('success', 'Product deleted successfully');
        res.redirect('/products');
    });
});

app.get('/angie', (req, res) => { res.render('angie'); });
app.get('/josh', (req, res) => { res.render('josh'); });
app.get('/kp', (req, res) => { res.render('kaipeng'); });
app.get('/myiesha', (req, res) => { res.render('myiesha'); });
app.get('/nx', (req, res) => { res.render('ningxin'); });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});