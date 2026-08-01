const express = require('express');
const mysql = require('mysql2');
const mysqlPromise = require('mysql2/promise');
const bcrypt = require('bcrypt');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const path = require('path');

const app = express();

// MySQL connection untuk query (promise-based)
const db = mysqlPromise.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: parseInt(process.env.DB_PORT || '4000'),
    ssl: { rejectUnauthorized: false },
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// MySQL connection untuk session store (callback-based)
const dbSession = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: parseInt(process.env.DB_PORT || '4000'),
    ssl: { rejectUnauthorized: false },
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Session store - simpan session ke database
const sessionStore = new MySQLStore({
    clearExpired: true,
    checkExpirationInterval: 900000,
    expiration: 86400000,
    createDatabaseTable: true,
    schema: {
        tableName: 'sessions',
        columnNames: {
            session_id: 'session_id',
            expires: 'expires',
            data: 'data'
        }
    }
}, dbSession);

// Setting Express & Middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.use(session({
    secret: process.env.SESSION_SECRET || 'rahasia_yang_penting_super_aman',
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
        secure: false,
        maxAge: 86400000,
        sameSite: 'lax'
    }
}));

// Static files - public folder
app.use(express.static(path.join(__dirname, '..', 'public')));
// Static files - assets folder
app.use(express.static(path.join(__dirname, '..', 'assets')));

// Middleware login check
function isLogin(req, res, next) {
    if (req.session.user) {
        next();
    } else {
        res.redirect('/login');
    }
}

// Health check
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// HOME
app.get('/', (req, res) => {
    if (req.session.user) {
        res.render('index', { user: req.session.user });
    } else {
        res.redirect('/login');
    }
});

// REGISTER
app.get('/register', (req, res) => {
    res.render('register', { error: null });
});

app.post('/register', async (req, res) => {
    const { username, email, password } = req.body;

    try {
        const [existing] = await db.query('SELECT * FROM users WHERE email = ?', [email]);

        if (existing.length > 0) {
            return res.render('register', { error: 'Hmm... email ini sudah terdaftar.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await db.query('INSERT INTO users (username, email, password) VALUES (?, ?, ?)', [username, email, hashedPassword]);

        res.redirect('/login?success=register');
    } catch (err) {
        console.error(err);
        res.render('register', { error: 'Terjadi kesalahan saat mendaftar!' });
    }
});

// LOGIN
app.get('/login', (req, res) => {
    res.render('login', { error: null });
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const [results] = await db.query('SELECT * FROM users WHERE email = ?', [email]);

        if (results.length === 0) {
            return res.render('login', { error: 'Hmm siapa ya? Maaf akun tidak ditemukan.' });
        }

        const user = results[0];
        const match = await bcrypt.compare(password, user.password);

        if (!match) {
            return res.render('login', { error: 'Password Salah!' });
        }

        req.session.user = {
            id: user.id,
            username: user.username,
            email: user.email
        };

        res.redirect('/');
    } catch (err) {
        console.error(err);
        res.render('login', { error: 'Terjadi kesalahan!' });
    }
});

// MENU UTAMA
app.get('/materi', isLogin, (req, res) => {
    res.render('materi', { user: req.session.user });
});

app.get('/bermain', isLogin, (req, res) => {
    res.render('bermain', { user: req.session.user });
});

app.get('/petunjuk', isLogin, (req, res) => {
    res.render('petunjuk', { user: req.session.user });
});

// SUB MATERI
app.get('/materi/diri', isLogin, (req, res) => {
    res.render('Materi/materi_diri', { user: req.session.user });
});

app.get('/materi/sosial', isLogin, (req, res) => {
    res.render('Materi/materi_sosial', { user: req.session.user });
});

// BERMAIN
app.get('/bermain/:kategori/:level', isLogin, (req, res) => {
    const { kategori, level } = req.params;
    res.render(`Bermain/${kategori}/${kategori}_${level}`, { user: req.session.user });
});

// LEVEL
app.get('/level/:kategori', isLogin, (req, res) => {
    const kategori = req.params.kategori;
    res.render('level', { user: req.session.user, kategori });
});

// SAVE SCORE DIRI
app.post('/save-score/diri', isLogin, async (req, res) => {
    const score = parseInt(req.body.score);
    const level = req.body.level;

    if (isNaN(score)) {
        return res.json({ success: false, message: 'Score tidak valid' });
    }

    try {
        const [results] = await db.query('SELECT history_diri FROM users WHERE id = ?', [req.session.user.id]);
        let history = [];

        if (results.length > 0 && results[0].history_diri) {
            try { history = JSON.parse(results[0].history_diri); } catch { history = []; }
        }

        history = history.filter(h => h.level !== level);
        history.push({ level });

        await db.query('UPDATE users SET score_pembinaan_diri = ?, history_diri = ? WHERE id = ?', [score, JSON.stringify(history), req.session.user.id]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.json({ success: false });
    }
});

// SAVE SCORE SOSIAL
app.post('/save-score/sosial', isLogin, async (req, res) => {
    const score = parseInt(req.body.score);
    const level = req.body.level;

    if (isNaN(score)) {
        return res.json({ success: false, message: 'Score tidak valid' });
    }

    try {
        const [results] = await db.query('SELECT history_sosial FROM users WHERE id = ?', [req.session.user.id]);
        let history = [];

        if (results.length > 0 && results[0].history_sosial) {
            try { history = JSON.parse(results[0].history_sosial); } catch { history = []; }
        }

        history = history.filter(h => h.level !== level);
        history.push({ level });

        await db.query('UPDATE users SET score_sosial = ?, history_sosial = ? WHERE id = ?', [score, JSON.stringify(history), req.session.user.id]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.json({ success: false });
    }
});

// LOGOUT
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login');
    });
});

// 404
app.use((req, res) => {
    res.status(404).send(`Route tidak ditemukan: ${req.url}`);
});

module.exports = app;
