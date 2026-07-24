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


// NING XIN: HOMEPAGE ROUTE (Carousel + Categories)
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


// NING XIN: PRODUCT VIEWING, CATEGORY FILTERING, SORTING & PRICE RANGE

app.get('/products', (req, res) => {
    let sql = "SELECT * FROM products WHERE 1=1";
    let params = [];

    // 1. Grab search query along with other filters
    const search = req.query.search || '';
    const category = req.query.category || '';
    const minPrice = req.query.minPrice || '';
    const maxPrice = req.query.maxPrice || '';
    const sort = req.query.sort || '';

    // 2. Append Search Filter (matches product name)
    if (search.trim() !== '') {
        sql += " AND productName LIKE ?";
        params.push(`%${search.trim()}%`);
    }

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

        // 3. Send 'search' back to EJS template
        res.render('products', {
            products: results,
            search: search,
            selectedCategory: category,
            selectedSort: sort,
            minPrice: minPrice,
            maxPrice: maxPrice,
            user: req.session.user || null
        });
    });
});

//josh//
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

//Edit Product (Kai Peng)
app.get('/editProduct/:id', isOwnerOrAdmin, (req, res) => {

    const productId = req.params.id;

    const sql = "SELECT * FROM products WHERE productId = ?";

    connection.query(sql, [productId], (err, results) => {

        if (err) throw err;

        if (results.length === 0) {
            return res.send("Product not found");
        }

        res.render("editProduct", {
            product: results[0],
            user: req.session.user
        });

    });

});

// add product routes (myiesha)
app.get('/addProduct', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');}

    res.render('addProducts', {
        user: req.session.user
    });
});

app.post('/addProduct', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }

    const { productName, category, description, stock, price, image } = req.body;
    const userId = req.session.user.id;

    const sql = `
        INSERT INTO products
        (productName, category, description, price, image, stock, userId)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    connection.query(
        sql,
        [
            productName,
            category,
            description,
            price,
            image,
            stock,
            userId
        ],
        (err) => {
            if (err) throw err;
            res.redirect('/products');
        });});

//Edit Product (Kai Peng)
app.post('/editProduct/:id', isOwnerOrAdmin, (req, res) => {
    const productId = req.params.id;

    const {
        productName,
        category,
        description,
        stock,
        price,
        image
    } = req.body;

    const sql = `
        UPDATE products
        SET
            productName = ?,
            category = ?,
            description = ?,
            stock = ?,
            price = ?,
            image = ?
        WHERE productId = ?
    `;

    connection.query(
        sql,
        [
            productName,
            category,
            description,
            stock,
            price,
            image,
            productId
        ],
        (err) => {
            if (err) throw err;
            res.redirect("/products");});});

// wishlist routes (myiesha)
app.post('/wishlist/add/:productid', checkAuthenticated, (req, res) => {

    const userId = req.session.user.id;
    const productId = req.params.productid;

    const checkSql = `
    SELECT * FROM wishlist
    WHERE userId = ? AND productId = ?
    `;
    console.log("User ID:", userId);
    console.log("Product ID:", productId);

    connection.query(checkSql, [userId, productId], (err, results) => {
        if (err) throw err;
        if (results.length > 0) {
            return res.redirect('/wishlist');}
        const insertSql = `
        INSERT INTO wishlist (userId, productId)
        VALUES (?, ?)
        `;

        connection.query(insertSql, [userId, productId], (err) => {
            if (err) throw err;
            res.redirect('/wishlist');});});});

app.get('/wishlist', checkAuthenticated, (req, res) => {
    const userId = req.session.user.userId;
    const sql = `
        SELECT products.*
        FROM wishlist
        JOIN products
        ON wishlist.productId = products.productId
        WHERE wishlist.userId = ?
    `;
    connection.query(sql, [userId], (err, results) => {

        if (err) {
            console.log(err);
            return res.send("Database Error");}

        // 👇 ADD THESE
        console.log("User ID:", userId);
        console.log("Wishlist Results:", results);

        res.render("wishlist", {
            products: results,
            user: req.session.user
        });});});

app.post('/wishlist/delete/:id', checkAuthenticated, (req, res) => {
    const sql = `
        DELETE FROM wishlist
        WHERE productId = ? AND userId = ?
    `;
    connection.query(sql, [req.params.id, req.session.user.id], (err) => {
        if (err) {
            console.log(err);
            return res.send("Database Error");}
        res.redirect("/wishlist");
});});

// delete products
app.post('/products/delete/:id', (req, res) => {

    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).send('Forbidden: Admins only');
    }

    const productId = req.params.id;

    const sql = `
        DELETE FROM products
        WHERE productId = ?
    `;

    connection.query(sql, [productId], (err) => {

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

// cart stuff (angie)
app.get('/cart', (req, res) => {
  if (!req.session.user) {return res.redirect('/login');}

  const userId = req.session.user.id;
  const sql = `
    select c.*, p.productName, p.price, p.image
    from cart c
    join products p on c.productId = p.productId
    where c.userId = ?`;

  connection.query(sql, [userId], (err, results) => {
    if (err) {
      console.error('Error fetching cart items:', err);
      return res.status(500).send('Database error');}

    res.render('cart', {
      user: req.session.user,
      cart: results || []});});});
      
app.post('/cart/add/:id', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login');}
  const userId = req.session.user.id;
  const productId = req.params.id;
  // Check if product already exists in cart
  const checkSql = 'SELECT quantity FROM cart WHERE userId = ? AND productId = ?';
  connection.query(checkSql, [userId, productId], (err, results) => {
    if (err) {
      console.error('Error checking cart:', err);
      return res.status(500).send('Database error');}
    if (results.length > 0) {
      // Product already in cart → increment quantity
      const updateSql = 'UPDATE cart SET quantity = quantity + 1 WHERE userId = ? AND productId = ?';
      connection.query(updateSql, [userId, productId], (err2) => {
        if (err2) {
          console.error('Error updating cart:', err2);
          return res.status(500).send('Database error');}
        res.redirect('/cart');});
    } else {
      // Product not in cart → insert new row
      const insertSql = 'INSERT INTO cart (userId, productId, quantity) VALUES (?, ?, 1)';
      connection.query(insertSql, [userId, productId], (err3) => {
        if (err3) {
          console.error('Error inserting cart item:', err3);
          return res.status(500).send('Database error');
        }
        res.redirect('/cart');});}});});

//remove item from cart 
 app.post('/cart/remove/:id', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login');}
  const userId = req.session.user.id;
  const productId = req.params.id;
  // Check current quantity
  const checkSql = 'SELECT quantity FROM cart WHERE userId = ? AND productId = ?';
  connection.query(checkSql, [userId, productId], (err, results) => {
    if (err) {
      console.error('Error checking cart item:', err);
      return res.status(500).send('Database error');}
    if (results.length === 0) {
      return res.redirect('/cart');}

    const currentQty = results[0].quantity;
    if (currentQty > 1) {
      // Decrement instead of delete
      const updateSql = 'UPDATE cart SET quantity = quantity - 1 WHERE userId = ? AND productId = ?';
      connection.query(updateSql, [userId, productId], (err2) => {
        if (err2) {
          console.error('Error updating cart item:', err2);
          return res.status(500).send('Database error');
        }
        res.redirect('/cart');
      });} else {
    
      const deleteSql = 'DELETE FROM cart WHERE userId = ? AND productId = ?';
      connection.query(deleteSql, [userId, productId], (err3) => {
        if (err3) {
          console.error('Error deleting cart item:', err3);
          return res.status(500).send('Database error');
        }
        res.redirect('/cart');});}});});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});