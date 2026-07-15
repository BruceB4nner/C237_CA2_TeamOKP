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

//sql connection
// const connection = mysql.createConnection({
//  host: 'localhost',
//  user: 'root',
//  password: 'root',
//  database: 'c237_studentlistapp'});
// connection.connect((err) => {
//  if (err) {console.error('Error connecting to MySQL:', err);
//  return;}
// console.log('Connected to MySQL database');});

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

//routes go HEREEEEEEEEEEEE (add all codes below this to prevent override)

//Main Page "/" Route
app.get('/', (req, res) => {
    res.render('index', {
        user: req.session.user,
        messages: req.flash('success')
    });
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port http://localhost:${PORT}`);
});









//HI GUYS I MADE THE REGISTER ROUTE//
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
    //******** TODO: Update register route to include role. ********//
    const { username, email, password, address, contact, role } = req.body;

    const sql = 'INSERT INTO users (username, email, password, address, contact , role) VALUES (?, ?, SHA2(? ,256), ?, ? ,?)';
    db.query(sql, [username, email, password, address, contact, role], (err, result) => {
        if (err) {
            throw err;
        }
        console.log(result);
        req.flash('success', 'Registration successful! Please log in.');
        res.redirect('/login');
    });
});