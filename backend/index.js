require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcrypt");
const path = require("path");
const multer = require("multer");
const session = require("express-session");
const csrf = require("csurf");
const cookieParser = require("cookie-parser");
const { OAuth2Client } = require("google-auth-library");
const jwt = require("jsonwebtoken");

const distPath = path.join(__dirname, 'dist');
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const client = new OAuth2Client(CLIENT_ID);

const storage = multer.memoryStorage();
const upload = multer({ storage });
const app = express();

// --- CORS ---
const allowedOrigins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "https://be-poli-pxil.onrender.com",
    "https://bepoli.onrender.com"
];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (!allowedOrigins.includes(origin)) return callback(new Error(`CORS non permesso: ${origin}`), false);
        callback(null, true);
    },
    credentials: true
}));

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Session ---
app.use(session({
    secret: process.env.SESSION_SECRET || "dev-secret",
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
        maxAge: 1000 * 60 * 30,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax"
    }
}));

// --- CSRF ---
const csrfProtection = csrf({ cookie: true });
app.use((req, res, next) => {
    if (req.headers["x-csrf-token"]) req.body._csrf = req.headers["x-csrf-token"];
    next();
});

// --- DB ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("MongoDB connesso"))
    .catch(err => console.error("Errore connessione DB:", err));

// --- Schemi ---
const utenteSchema = new mongoose.Schema({
    nome: String,
    username: { type: String, unique: true },
    password: String,
    bio: String,
    profilePic: { data: Buffer, contentType: String },
    followers: [{ type: mongoose.Schema.Types.ObjectId, ref: "Utente" }],
    following: [{ type: mongoose.Schema.Types.ObjectId, ref: "Utente" }],
    utentiRecenti: [{ type: mongoose.Schema.Types.ObjectId, ref: "Utente" }],
});
const Utente = mongoose.model("Utente", utenteSchema);

// --- Funzioni helper ---
function getFingerprint(req) {
    return req.headers["user-agent"] || "";
}

function checkFingerprint(req, res, next) {
    if (!req.session.user) return res.status(401).json({ message: "Non autorizzato" });
    const current = getFingerprint(req);
    if (!req.session.fingerprint) req.session.fingerprint = current;
    if (req.session.fingerprint !== current) {
        req.session.destroy(() => res.status(403).json({ message: "Sessione invalida" }));
    } else next();
}

// --- Rotte Auth ---
app.get("/csrf-token", csrfProtection, (req, res) => res.json({ csrfToken: req.csrfToken() }));

app.post("/login", csrfProtection, async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: "Dati mancanti" });

    try {
        const user = await Utente.findOne({ username });
        if (!user || !(await bcrypt.compare(password, user.password)))
            return res.status(400).json({ message: "Username o password errati" });

        req.session.user = { id: user._id, nome: user.nome, username: user.username };
        req.session.fingerprint = getFingerprint(req);
        res.json({ message: "Login riuscito", user: req.session.user });
    } catch {
        res.status(500).json({ message: "Errore server" });
    }
});

// --- Avvio server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log(`Server attivo su porta ${PORT}`));
