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
    // Left join fetches ALL products, plus the latest review if one exists
    const sql = `
        SELECT 
            p.*, 
            r.rating, 
            r.comment, 
            u.username
        FROM products p
        LEFT JOIN reviews r ON r.reviewId = (
            SELECT MAX(reviewId) FROM reviews WHERE productId = p.productId
        )
        LEFT JOIN users u ON r.userId = u.id
        WHERE p.stock > 0
    `;

    connection.query(sql, (err, results) => {
        if (err) {
            console.error('Error fetching homepage:', err);
            return res.render('index', {
                user: req.session.user,
                messages: req.flash('success'),
                products: [],
                categories: CATEGORIES
            });
        }

        res.render('index', {
            user: req.session.user,
            messages: req.flash('success'),
            products: results,
            categories: CATEGORIES
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
            return res.status(500).send("Server Error");}

        // 3. Send 'search' back to EJS template
        res.render('products', {
            products: results,
            search: search,
            selectedCategory: category,
            selectedSort: sort,
            minPrice: minPrice,
            maxPrice: maxPrice,
            user: req.session.user || null});});});

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
        return res.redirect('/login');}
    const sql = 'SELECT * FROM users WHERE email = ? AND password = SHA2(?,256)';
    connection.query(sql, [email, password], (err, results) => {
        if (err) throw err;

        if (results.length > 0) {
            req.session.user = results[0];
            req.flash('success', 'Login successful!');
            res.redirect('/');
        } else {
            req.flash('error', 'Invalid email or password.');
            res.redirect('/login');}});});

app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) return res.redirect('/');
        res.redirect('/');
    });
});

// 1. Single product route (ensure it renders 'product')
// angie - change the render to productDetails
app.get('/products/:id', (req, res) => {
    const productId = req.params.id;

    const sql = `
        SELECT * FROM products 
        WHERE productId = ?
    `;

    connection.query(sql, [productId], (err, results) => {

        if (err) throw err;

        if (results.length === 0) {
            return res.status(404).send('Product not found');
        }


        const product = results[0];


        const reviewSql = `
            SELECT r.*, u.username
            FROM reviews r
            JOIN users u 
            ON r.userId = u.id
            WHERE r.productId = ?
        `;


        connection.query(reviewSql, [productId], (err, reviews) => {

            if (err) throw err;


            let canReview = false;


            // Check if user bought this product
            if(req.session.user){

                const purchaseSql = `
                    SELECT *
                    FROM orders
                    WHERE userId = ?
                    AND productId = ?
                `;


                connection.query(
                    purchaseSql,
                    [
                        req.session.user.id,
                        productId
                    ],
                    (err, orders)=>{

                        if(err) throw err;


                        if(orders.length > 0){
                            canReview = true;
                        }


                        res.render('productDetails',{
                            product: product,
                            reviews: reviews,
                            user:req.session.user,
                            canReview:canReview
                        });

                    }
                );


            }else{

                res.render('productDetails',{
                    product:product,
                    reviews:reviews,
                    user:null,
                    canReview:false
                });

            }

        });

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
        });});});

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
        return res.redirect('/login');}
    const { productName, category, description, stock, price, image } = req.body;
    const userId = req.session.user.id;
    const sql = `
        INSERT INTO products
        (productName, category, description, price, image, stock, userId)
        VALUES (?, ?, ?, ?, ?, ?, ?)`;

    connection.query(
        sql,[productName,category,description,
            price,image,stock,userId],
        (err) => {
            if (err) throw err;
            res.redirect('/products');});});

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
    console.log(req.session.user);
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
    const userId = req.session.user.id;
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

// user profile route (myiesha)
app.get('/profile', checkAuthenticated, (req, res) => {
    res.render('profile', {
        user: req.session.user
    });
});

// delete products
app.post('/products/delete/:id', (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).send('Forbidden: Admins only');}
    const productId = req.params.id;
    const sql = `
        DELETE FROM products
        WHERE productId = ?
    `;
    connection.query(sql, [productId], (err) => {
        if (err) throw err;
        req.flash('success', 'Product deleted successfully');
        res.redirect('/products');});});

//angies routes all below (i think)
app.get('/angie', (req, res) => { res.render('angie'); });
app.get('/josh', (req, res) => { res.render('josh'); });
app.get('/kp', (req, res) => { res.render('kaipeng'); });
app.get('/myiesha', (req, res) => { res.render('myiesha'); });
app.get('/nx', (req, res) => { res.render('ningxin'); });

// cart stuff (angie)
app.get('/cart', (req, res) => {if (!req.session.user) {return res.redirect('/login');}

  const userId = req.session.user.id;
  const sql = `select c.*, p.productName, p.price, p.image
    from cart c
    join products p on c.productId = p.productId
    where c.userId = ?`;

  connection.query(sql, [userId], (err, results) => {if (err) {
      console.error('Error fetching cart items:', err);
      return res.status(500).send('Database error');}

    res.render('cart', {user: req.session.user,cart: results || []});});});

app.post('/cart/add/:id', (req, res) => {
  if (!req.session.user) return res.redirect('/login');

  const userId = req.session.user.id;
  const productId = req.params.id;

  // Check product stock first
  connection.query('SELECT stock, userId FROM products WHERE productId = ?', [productId], (err, results) => {
    if (err) return res.status(500).send('Database error');
    if (results.length === 0) return res.status(404).send('Product not found');
    if (results[0].userId === userId) {
    return res.status(400).send('You cannot buy your own product');
    }

    const stock = results[0].stock;
    const sellerId = results[0].userId;

    if (sellerId == userId) {
    return res.status(400).send('You cannot buy your own product.');
    }
    if (stock <= 0) {
      return res.status(400).send('This product is out of stock');
    }
const sql = `
  INSERT INTO cart (userId, productId, quantity)
  VALUES (?, ?, 1)
  ON DUPLICATE KEY UPDATE quantity = quantity + 1
`;
connection.query(sql, [userId, productId], (err2) => {
  if (err2) return res.status(500).send('Database error');
  res.redirect('/cart');
});

  });
});


//remove item from cart 
 app.post('/cart/remove/:id', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login');}
  const userId = req.session.user.id;
  const productId = req.params.id;
  
  const checkSql = 'SELECT quantity FROM cart WHERE userId = ? AND productId = ?';
  connection.query(checkSql, [userId, productId], (err, results) => {
    if (err) {
      console.error('Error checking cart item:', err);
      return res.status(500).send('Database error');}

    if (results.length === 0) {
      return res.redirect('/cart');}

    const qty = results[0].quantity;
    if (qty > 1) {
      // Decrement quantity
      const updateSql = 'UPDATE cart SET quantity = quantity - 1 WHERE userId = ? AND productId = ?';
      connection.query(updateSql, [userId, productId], (err2) => {
        if (err2) {
          console.error('Error updating cart item:', err2);
          return res.status(500).send('Database error');}
        res.redirect('/cart');});
    } else {
      // Delete row if only 1 left
      const deleteSql = 'DELETE FROM cart WHERE userId = ? AND productId = ?';
      connection.query(deleteSql, [userId, productId], (err3) => {
        if (err3) {
          console.error('Error deleting cart item:', err3);
          return res.status(500).send('Database error');}
        res.redirect('/cart');});}});});

// GET route for checkout page
app.get('/checkout', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login');}

  const userId = req.session.user.id;
  const sql = `
    SELECT c.productId, c.quantity, p.productName, p.price, p.image
    FROM cart c
    JOIN products p ON c.productId = p.productId
WHERE c.userId = ?`;
  connection.query(sql, [userId], (err, results) => {
    if (err) {
      console.error('Error fetching cart items:', err);
      return res.status(500).send('Database error');}

    res.render('checkout', {
      user: req.session.user,
      cart: results});});});

//checkout
app.post('/checkout', (req, res) => {
  if (!req.session.user) return res.redirect('/login');

  const userId = req.session.user.id;
  const { address, cardNumber, expiry, cvv } = req.body;

  if (!cardNumber || !expiry || !cvv) {
    return res.status(400).send('Invalid payment details');
  }

  const cartSql = `
    SELECT c.productId, c.quantity, p.stock
    FROM cart c
    JOIN products p ON c.productId = p.productId
    WHERE c.userId = ?
  `;

  connection.query(cartSql, [userId], (err, items) => {
    if (err) return res.status(500).send('Database error');

    const updates = items.map(item => {
      return new Promise((resolve, reject) => {
        const newStock = item.stock - item.quantity;

        connection.query(
          'UPDATE products SET stock = ? WHERE productId = ?',
          [Math.max(newStock, 0), item.productId],
          err2 => {
            if (err2) {
              reject(err2);
            } else {
              resolve();
            }
          }
        );
      });
    });


    Promise.all(updates)
.then(() => {

    const orderValues = items.map(item => [
        userId,
        item.productId,
        item.quantity
    ]);

    console.log("ORDER VALUES:", orderValues);

    const orderSql = `
        INSERT INTO orders
        (userId, productId, quantity)
        VALUES ?
    `;

    connection.query(orderSql, [orderValues], (errOrder) => {

        if (errOrder) {
            console.log(errOrder);
            return res.status(500).send("Saving order failed");
        }

        connection.query(
            'DELETE FROM cart WHERE userId = ?',
            [userId],
            err4 => {

                if (err4) {
                    return res.status(500).send('Database error');
                }

                res.render('checkout-success', { address });

            }
        );

    });

})
.catch(err5 => {
    console.error('Error during checkout:', err5);
    res.status(500).send('Checkout failed');
});
    });
});
// Show only logged in users listings
app.get('/userproducts', (req, res) => {if (!req.session.user) {
    return res.redirect('/login');}
  const userId = req.session.user.id;
  const sql = 'SELECT * FROM products WHERE userId = ?';

  connection.query(sql, [userId], (err, results) => {
    if (err) {
      console.error('Error fetching user products:', err);
      return res.status(500).send('Database error');}

    res.render('userproducts', {user: req.session.user,products: results});});});

app.post('/review/:id', checkAuthenticated, (req,res)=>{


    const productId = req.params.id;

    const userId = req.session.user.id;


    const {
        rating,
        comment
    } = req.body;



    const sql = `
        INSERT INTO reviews
        (userId, productId, rating, comment)
        VALUES (?, ?, ?, ?)
        `;


    connection.query(
        sql,
        [
            userId,
            productId,
            rating,
            comment
        ],
        (err)=>{


            if(err){
                console.log(err);
                return res.status(500).send("Review failed");
            }


            res.redirect('/products/' + productId);

        }
    );


});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});