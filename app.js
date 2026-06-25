/* =========================
   IMPORT MODULE
========================= */
const express = require('express'); // Framework untuk membuat server web
const mysql = require('mysql2'); // Modul koneksi ke database MySQL
const bcrypt = require('bcrypt'); // Modul enkripsi password
const session = require('express-session'); // Modul pengelola session login
const path = require('path'); // Modul pengelola path file/folder
const app = express(); // untuk menjalankan web Express

/* koneksi ke MySQL */
const db = mysql.createConnection({
    host: 'thomas.proxy.rlwy.net',
    user: 'root',
    password: 'NrtUjwvBwDRuVUQqQjksMucKCMUnZKCP',
    database: 'railway',
    port: 47016,
    ssl: {
        rejectUnauthorized: true
    }
});

// koneksi database
db.connect((err) => {
    if (err) {
        console.error('Gagal konek ke MySQL:', err.message);
        return;
    }
    console.log('Terhubung ke Database MySQL!');
});

// Setting Express & Middleware ( fungsi yang berada di tengah proses request dan response untuk melakukan pengecekan)
// set EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ambil data dari form
app.use(express.urlencoded({ extended: false }));

// membaca data JSON dari fetch
app.use(express.json());

/* ✅ WAJIB: SESSION */
app.use(session({
    secret: process.env.SESSION_SECRET || 'rahasia_yang_penting_super_aman',
    resave: false,
    saveUninitialized: true
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
app.post('/register', (req, res) => {

    // Mengambil data dari body
    const { username, email, password } = req.body;

    // Mengecek apakah email sudah ada di database
    db.query(
        //Ambil semua data dari tabel users yang emailnya sama dengan email yang dimasukkan user.
        'SELECT * FROM users WHERE email = ?',
        [email], // nilai email menggantikan tanda ?
        async (err, results) => {

            // Jika query ke database gagal, tampilkan halaman register dengan pesan error.
            if (err) {
                return res.render('register', {
                    error: 'Terjadi kesalahan!'
                });
            }

            // Jika email ditemukan (sudah terdaftar)
            //Jika hasil query lebih dari 0, berarti email sudah ada.
            if (results.length > 0) {
                return res.render('register', {
                    error: 'Hmm... email ini sudah terdaftar.'
                });
            }

            try {

                // Mengenkripsi password menggunakan bcrypt
                // angka 10 adalah salt rounds
                const hashedPassword = await bcrypt.hash(password, 10);

                // Menyimpan data user baru ke database
                db.query(
                    'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',

                    // Data yang akan dimasukkan
                    [username, email, hashedPassword],

                    // Callback setelah proses insert
                    (err) => {

                        // Jika gagal menyimpan data
                        if (err) {
                            return res.render('register', {
                                error: 'Gagal membuat akun!'
                            });
                        }

                        // Jika berhasil, dia ke halaman login
                        // dengan parameter success= yang akan muncul notif berhasil
                        res.redirect('/login?success=register');
                    }
                );

            } catch {

                // Jika terjadi error saat hashing password
                res.render('register', {
                    error: 'Terjadi kesalahan saat mendaftar!'
                });

            }

        }
    );
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
app.post('/login', (req, res) => {

    // Mengambil data email dan password dari form yang dikirim user
    const { email, password } = req.body;

    // Mencari user di database berdasarkan email
    db.query(
        'SELECT * FROM users WHERE email = ?',
        [email],

        // Callback setelah query selesai dijalankan
        async (err, results) => {

            // Jika terjadi error database
            // ATAU email tidak ditemukan
            if (err || results.length === 0) {

                // Kembali ke halaman login dengan pesan error
                return res.render('login', {
                    error: 'Hmm siapa ya? Maaf akun tidak ditemukan.'
                });
            }

            // Mengambil data user pertama yang ditemukan
            const user = results[0];

            // Membandingkan password input user
            // dengan password hash yang tersimpan di database
            const match = await bcrypt.compare(password, user.password);

            // Jika password tidak cocok
            if (!match) {

                // Tampilkan kembali halaman login
                // dengan pesan password salah
                return res.render('login', {
                    error: 'Password Salah!'
                });
            }

            // Jika login berhasil
            // Simpan data user ke session
            req.session.user = {
                id: user.id,
                username: user.username,
                email: user.email
            };

            // Redirect ke halaman utama (/)
            res.redirect('/');
        }
    );
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
app.post('/save-score/diri', isLogin, (req, res) => {

    // Mengubah score menjadi integer
    const score = parseInt(req.body.score);
    const level = req.body.level; //Ambil nilai req.body.level

    // Mengecek apakah nilai score BUKAN angka/string(NaN = Not a Number)
    if (isNaN(score)) {

        // Menghentikan proses fungsi saat ini karena ada return
        // dan mengirim respon JSON ke frontend
        return res.json({

            // Menandakan proses gagal
            success: false,

            // Pesan yang akan diterima frontend
            message: 'Score tidak valid'
        });
    }

    db.query(
        // Mengambil data history_diri milik user yang sedang login
        'SELECT history_diri FROM users WHERE id = ?',
        [req.session.user.id], (err, results) => {
            // Menyiapkan array kosong untuk menyimpan riwayat level
            let history = [];

            // Jika data user ditemukan DAN history_diri tidak kosong
            if (results.length > 0 && results[0].history_diri) {
                try {
                    history = JSON.parse(results[0].history_diri);
                } catch {
                    history = [];
                }
            }

            // Menghapus data level yang sama agar tidak terjadi duplikasi
            history = history.filter(h => h.level !== level);

            // Menambahkan level terbaru yang baru saja diselesaikan user
            history.push({
                level: level,
            });

            // Menyimpan score terbaru dan history terbaru ke database
            db.query(
                `
                UPDATE users 
                SET score_pembinaan_diri = ?, history_diri = ?
                WHERE id = ?
                `,
                [
                    score, //poin yang di dapatkan user

                    // Mengubah array history menjadi JSON string
                    // agar bisa disimpan ke database
                    JSON.stringify(history),

                    //Ini mengambil ID user yang sedang login
                    req.session.user.id
                ],

                // Callback (setelah proses UPDATE selesai
                (err) => {
                    // Jika terjadi error saat update database
                    if (err) {
                        // Menampilkan error di terminal
                        console.error(err);

                        // Mengirim respon gagal ke frontend
                        return res.json({ success: false });
                    }

                    // Jika update berhasil
                    // kirim respon sukses ke frontend BUKAN Menampilkan
                    res.json({ success: true });
                }
            );
        }
    );
});

/* =========================
   SIMPAN SCORE SOSIAL
========================= */

app.post('/save-score/sosial', isLogin, (req, res) => {

    const score = parseInt(req.body.score);
    const level = req.body.level;
    if (isNaN(score)) {
        return res.json({
            success: false,
            message: 'Score tidak valid'
        });
    }

    db.query(
        'SELECT history_sosial FROM users WHERE id = ?',
        [req.session.user.id],
        (err, results) => {

            let history = [];

            if (results.length > 0 && results[0].history_sosial) {
                try {
                    history = JSON.parse(results[0].history_sosial);
                } catch {
                    history = [];
                }
            }

            // hapus level yang sama (biar tidak dobel)
            history = history.filter(h => h.level !== level);

            // tambah data baru
            history.push({
                level: level,
            });

            db.query(
                `
                UPDATE users 
                SET score_sosial = ?, history_sosial = ?
                WHERE id = ?
                `,
                [
                    score,
                    JSON.stringify(history),
                    req.session.user.id
                ],
                (err) => {
                    if (err) {
                        console.error(err);
                        return res.json({ success: false });
                    }

                    res.json({ success: true });
                }
            );
        }
    );
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
