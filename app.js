const express = require('express');
const mysql = require('mysql2');
const app = express();
const multer = require('multer');
const session = require('express-session');
const flash = require('connect-flash');

// Multer Storage Setup
const storage = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, 'public/images') },
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

// Set up view engine
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

        // Fetch homepage customer reviews
        connection.query(sqlReviews, (err, reviews) => {
            if (err) {
                // If reviews table does not exist yet, fallback gracefully
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
// NING XIN: PRODUCT VIEWING, SEARCHING & CATEGORY FILTERING
// ==========================================
app.get('/products', (req, res) => {
    const search = req.query.search || '';
    const category = req.query.category || '';

    let sql = 'SELECT * FROM products WHERE 1=1';
    let queryParams = [];

    // Filter by Keyword (searches productName)
    if (search.trim() !== '') {
        sql += ' AND productName LIKE ?';
        queryParams.push(`%${search.trim()}%`);
    }

    // Filter by Selected Category
    if (category.trim() !== '') {
        sql += ' AND category = ?';
        queryParams.push(category.trim());
    }

    connection.query(sql, queryParams, (err, results) => {
        if (err) {
            console.error('Error fetching products:', err);
            return res.status(500).send('Database Error');
        }

        res.render('products', {
            products: results,
            search: search,
            selectedCategory: category,
            categories: CATEGORIES,
            user: req.session.user
        });
    });
});

// ==========================================
// AUTHENTICATION ROUTES (Josh)
// ==========================================

// Register Routes
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

// Login Routes
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

// Logout Route
app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) return res.redirect('/');
        res.redirect('/');
    });
});


// ==========================================
// PRODUCT DETAILS & MANAGEMENT
// ==========================================

// View Product Details (Josh / Myiesha)
app.get('/products/:id', (req, res) => {
    const productId = req.params.id;
    const sql = 'SELECT * FROM products WHERE productId = ?';

    connection.query(sql, [productId], (err, results) => {
        if (err) throw err;

        if (results.length === 0) {
            return res.status(404).send('Product not found');
        }

        const product = results[0];
        res.render('productDetails', { product, user: req.session.user });
    });
});

// Add Product Routes (Myiesha)
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

// Delete Product Route (Kai Peng / Admin)
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

// Individual Member Test Routes
app.get('/angie', (req, res) => { res.render('angie') });
app.get('/josh', (req, res) => { res.render('josh') });
app.get('/kp', (req, res) => { res.render('kaipeng') });
app.get('/myiesha', (req, res) => { res.render('myiesha') });
app.get('/nx', (req, res) => { res.render('ningxin') });

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});