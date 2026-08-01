/* =========================
   IMPORT MODULE
========================= */
const express = require('express'); // Framework untuk membuat server web
const mysql = require('mysql2'); // Modul koneksi ke database MySQL
const bcrypt = require('bcrypt'); // Modul enkripsi password
const session = require('express-session'); // Modul pengelola session login
const MySQLStore = require('express-mysql-session')(session); // Session store ke database
const path = require('path'); // Modul pengelola path file/folder
const app = express(); // untuk menjalankan web Express

/* =========================
   KONEKSI DATABASE
   ========================= */
let db;
let dbSession;

if (process.env.DB_HOST) {
    // Vercel / TiDB Cloud
    db = mysql.createPool({
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
    dbSession = db;
    console.log('Terhubung ke TiDB Cloud!');
} else {
    // Local (XAMPP)
    db = mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'node_auth'
    });
    dbSession = db;

    db.connect((err) => {
        if (err) {
            console.error('Gagal konek ke MySQL:', err.message);
            return;
        }
        console.log('Terhubung ke Database MySQL Local!');
    });
}

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
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

/* ✅ WAJIB: SESSION - simpan ke database */
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

// akses file static
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'assets')));

/* =========================
   MIDDLEWARE LOGIN (perantara, untuk melakukan pengecekan)
========================= */

// req  = request (data yang dikirim browser ke server)
// res  = response (balasan dari server ke browser)
// next = melanjutkan ke middleware/route berikutnya
//Pemeriksaan login
function isLogin(req, res, next) {

    // req.session.user berisi data user yang sedang login
    if (req.session.user) {
        // jika user login lanjut ke halaman tujuan
        next();

    } else {
        // jika belum login arahkan ke halaman login
        res.redirect('/login');
    }
}

/* =========================
   HEALTH CHECK (untuk Railway)
========================= */
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// --- ROUTES ---
// Halaman Home (Hanya bisa diakses kalau sudah login)
// app.get() = route GET untuk membuka halaman
app.get('/', (req, res) => {

    // req.session.user = data user yang tersimpan di session (jika sudah login)
    if (req.session.user) {

        // render = menampilkan file EJS
        // index = views/index.ejs
        // user dikirim ke halaman EJS
        res.render('index', {
            user: req.session.user
        });

    } else {
        // jika belum login arahkan ke halaman login
        res.redirect('/login');
    }
});

/* =========================
   REGISTER
========================= */

// Menampilkan halaman register
// get mengambil/menampilkan data 
app.get('/register', (req, res) => {

    // Render file register.ejs dan kirim nilai error = null
    res.render('register', { error: null }); //akan bernilai false, sehingga pesan error tidak ditampilkan.

});

//memproses data register yang dikirim user
//post Mengirim data ke server 
app.post('/register', async (req, res) => {
    const { username, email, password } = req.body;

    try {
        // Cek apakah email sudah ada
        const [existing] = await db.query('SELECT * FROM users WHERE email = ?', [email]);

        if (existing.length > 0) {
            return res.render('register', { error: 'Hmm... email ini sudah terdaftar.' });
        }

        // Hash password lalu simpan
        const hashedPassword = await bcrypt.hash(password, 10);
        await db.query('INSERT INTO users (username, email, password) VALUES (?, ?, ?)', [username, email, hashedPassword]);

        res.redirect('/login?success=register');
    } catch (err) {
        console.error(err);
        res.render('register', { error: 'Gagal membuat akun!' });
    }
});


/* =========================
   LOGIN
========================= */

// Menampilkan halaman login saat user membuka URL /login
app.get('/login', (req, res) => {

    // Render file view login.ejs
    // error diisi null karena belum ada pesan error
    res.render('login', { error: null });
});


//memproses data login yang dikirim user
//post Mengirim data ke server 
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


/* =========================
   MENU UTAMA
========================= */
// Hanya bisa diakses jika user sudah login (isLogin)
//Menampilkan halaman Materi, Bermain, dan Petunjuk.
app.get('/materi', isLogin, (req, res) => {
    res.render('materi', { user: req.session.user }); // mengirim data user ke view
});

app.get('/bermain', isLogin, (req, res) => {
    res.render('bermain', { user: req.session.user });
});

app.get('/petunjuk', isLogin, (req, res) => {
    res.render('petunjuk', { user: req.session.user });
});


/* =========================
   SUB MATERI
========================= */
// Menampilkan materi pembinaan diri
app.get('/materi/diri', isLogin, (req, res) => {
    res.render('Materi/materi_diri', { user: req.session.user });// mengirim data user ke view
});

// Menampilkan materi sosial
app.get('/materi/sosial', isLogin, (req, res) => {
    res.render('Materi/materi_sosial', { user: req.session.user });
});


/* =========================
  BERMAIN
========================= */
//Menampilkan halaman bermain berdasarkan kategori dan level
app.get('/bermain/:kategori/:level', isLogin, (req, res) => {
    const { kategori, level } = req.params;

    res.render(`Bermain/${kategori}/${kategori}_${level}`, { //Bermain/diri/diri_2
        user: req.session.user,
    });
});

/* =========================
   LEVEL
========================= */
// Menampilkan halaman level
app.get('/level/:kategori', isLogin, (req, res) => {
    const kategori = req.params.kategori; //ambil kategori sesuai URL yang dibuka.

    res.render('level', {
        user: req.session.user,
        kategori
    });
});

/* =========================
   SIMPAN SCORE PEMBINAAN DIRI
========================= */
//post Mengirim data ke server 
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

/* =========================
   SIMPAN SCORE SOSIAL
========================= */

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

/* =========================
   LOGOUT
========================= */
// Menghapus session user saat logout
app.get('/logout', (req, res) => {

    req.session.destroy(() => {

        // Setelah session dihapus
        // ke halaman login
        res.redirect('/login');
    });
});


/* =========================
   ERROR 404
========================= */
// Menangani route yang tidak ditemukan
app.use((req, res) => {

    res.status(404).send(
        `Route tidak ditemukan: ${req.url}`
    );
});


/* =========================
   SERVER
========================= */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server jalan di http://localhost:${PORT}`);
});
