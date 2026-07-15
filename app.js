const express = require('express');
const mysql = require('mysql2');
const app = express();
const multer = require('multer');
const storage =multer.diskStorage({
    destination: (req,file,cb)=>{cb(null,'public/images')},
    filename:(req,file,cb)=>{cb(null, file.originalname);}
});
const upload = multer({storage:storage})

//sql connection
const connection = mysql.createConnection({
 host: 'localhost',
 user: 'root',
 password: 'root',
 database: 'c237_studentlistapp'});
connection.connect((err) => {
 if (err) {console.error('Error connecting to MySQL:', err);
 return;}
console.log('Connected to MySQL database');});

// Set up view engine
app.set('view engine', 'ejs');
// enable static files
app.use(express.static('public'));
//enable form processing 
app.use(express.urlencoded({extended:false}));
app.use(express.static('public'));

//routes go HEREEEEEEEEEEEE (add all codes below this to prevent override)


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port http://localhost:${PORT}`);
});