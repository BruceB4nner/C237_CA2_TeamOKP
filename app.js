const express = require('express');
const mysql = require('mysql2');
const app = express();
const multer = require('multer');
const session = require('express-session');
const flash = require('connect-flash');

const storage = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, 'public/images') },
    filename: (req, file, cb) => { cb(null, file.originalname); }
});
const upload = multer({ storage: storage });

//sql connectionm (use the teachers azure lab connection)
 const connection = mysql.createConnection({
  host: 'c237-eaint-mysql.mysql.database.azure.com',
 user: 'c237_029',
 password: 'c237029@2026!',
 database: 'c237_029_teamongkaipeng', 
 //tells exp serv to only allow a secure, encrypted connection to the onlien azure db
ssl:{rejectUnauthorized: true}});
connection.connect((err) => {
 if (err) {console.error('Error connecting to MySQL:', err);
 return;}
console.log('Connected to MySQL database');});

// Set up view engine
app.set('view engine', 'ejs');

// enable static files
app.use(express.static('public'));

// enable form processing
app.use(express.urlencoded({ extended: false }));

// session + flash - required for req.session and req.flash to work at all
app.use(session({
    secret: 'someSecretKeyChangeMe', // any random string, just signs the cookie
    resave: false,
    saveUninitialized: true
}));
app.use(flash());

//Middleware to track session
app.use((req, res, next) => {
  res.locals.user = req.session.user;
  next();
});

//routes go HEREEEEEEEEEEEE (add all codes below this to prevent override)

//Main Page "/" Route
app.get('/', (req, res) => {
    res.render('index', {
        user: req.session.user,
        messages: req.flash('success')
    });
});

app.get('/products', (req, res) => {
    const search = req.query.search || '';

    connection.query(
        'SELECT * FROM products WHERE stock > 0',
        (err, results) => {

            if (err) throw err;

            res.render('products', {
                products: results,
                search: search,
                user: req.session.user
            });

        }
    );
});

//HI GUYS I MADE THE REGISTER ROUTE
//Register Session MiddleWare(Josh)
app.use(session({
    secret: 'secret',
    resave: false,
    saveUninitialized: true,
    // Session expires after 1 week of inactivity
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 }

}));

//Register GET Route (Josh)
app.get('/register', (req, res) => {
    res.render('register', { messages: req.flash('error'), formData: req.flash('formData')[0] });
});

//validateRegistration (Josh)
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
    //If all validations pass, the next function is called, allowing the request to proceed to the 
    //next middleware function or route handler.
    next();
};

//POST Route + Regsitration Validation(Josh)
app.post('/register', validateRegistration, (req, res) => {
    const { username, email, password, address, contact, role } = req.body;

    const sql = 'INSERT INTO users (username, email, password, address, contact , role) VALUES (?, ?, SHA2(? ,256), ?, ? ,?)';
    connection.query(sql, [username, email, password, address, contact, role], (err, result) => {
        if (err) {
            throw err;
        }
        console.log(result);
        req.flash('success', 'Registration successful! Please log in.');
        res.redirect('/login');
    });
});
app.get('/angie',(req,res)=>{res.render('angie')})
app.get('/josh',(req,res)=>{res.render('josh')})
app.get('/kp',(req,res)=>{res.render('kaipeng')})
app.get('/myiesha',(req,res)=>{res.render('myiesha')})
app.get('/nx',(req,res)=>{res.render('ningxin')})

//Login Route Starts here (Josh)
app.get('/login', (req, res) => {
    res.render('login', { 
        messages: req.flash('success'), 
        errors: req.flash('error') 
    });
});

app.post('/login', (req, res) => {
    const { email, password } = req.body;

    // Validate email and password
    if (!email || !password) {
        req.flash('error', 'All fields are required.');
        return res.redirect('/login');
    }

    const sql = 'SELECT * FROM users WHERE email = ? AND password = SHA2(?,256)';
    connection.query(sql, [email, password], (err, results) => {
        if (err) {
            throw err;
        }

        if (results.length > 0) {
            // Successful login
            req.session.user = results[0]; // store user in session
            req.flash('success', 'Login successful!');
            //******** TO DO: Update to redirect users to /dashboard route upon successful log in ********//
            res.redirect('/');
        } else {
            // Invalid credentials
            req.flash('error', 'Invalid email or password.');
            res.redirect('/login');
        }
    });
});

//Log Out Route(Josh)
app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.redirect('/'); // fallback if session can't be destroyed
    }
    res.redirect('/'); // send them back to login page
  });
});

// add product route (myiesha)
// get route
app.get('/addProduct', (req, res) => {
    res.render('addProducts');
});

// post route
app.post('/addProduct', (req, res) => {

    const {
        productName,
        category,
        quantity,
        price,
        image
    } = req.body;

    const sql = `
        INSERT INTO products
        (productName, category, quantity, price, image, stock)
        VALUES (?, ?, ?, ?, ?, 1)
    `;

    connection.query(
        sql,
        [productName, category, quantity, price, image],
        (err) => {

            if (err) throw err;

            res.redirect('/products');

        }
    );

});

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

// all routes go above this port initializer please thank u :)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port http://localhost:${PORT}`);
});