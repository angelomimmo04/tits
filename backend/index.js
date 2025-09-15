require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcrypt");
const path = require("path");
const multer = require("multer");
const session = require("express-session");
const MongoStore = require("connect-mongo");
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

// --- Session con MongoStore ---
app.use(session({
  secret: process.env.SESSION_SECRET || "dev-secret",
  resave: false,
  saveUninitialized: false,
  rolling: true,
  store: MongoStore.create({ mongoUrl: process.env.MONGO_URI }),
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
  utentiRecenti: [{ type: mongoose.Schema.Types.ObjectId, ref: "Utente" }]
});
const Utente = mongoose.model("Utente", utenteSchema);

// --- Helper ---
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

app.post("/register", csrfProtection, async (req, res) => {
  const { nome, username, password } = req.body;
  if (!nome || !username || !password) return res.status(400).json({ message: "Dati mancanti" });
  try {
    if (await Utente.findOne({ username })) return res.status(400).json({ message: "Username già esistente" });
    const hash = await bcrypt.hash(password, 10);
    const nuovoUtente = new Utente({ nome, username, password: hash, bio: "", profilePic: { data: null, contentType: null } });
    await nuovoUtente.save();
    res.status(201).json({ message: "Registrazione completata" });
  } catch {
    res.status(500).json({ message: "Errore server" });
  }
});

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

app.post("/auth/google", async (req, res) => {
  const { id_token } = req.body;
  if (!id_token) return res.status(400).json({ message: "Token mancante" });
  try {
    const ticket = await client.verifyIdToken({ idToken: id_token, audience: CLIENT_ID });
    const payload = ticket.getPayload();

    let utente = await Utente.findOne({ username: payload.email });
    if (!utente) {
      utente = new Utente({ nome: payload.name, username: payload.email, password: "", bio: "", profilePic: { data: null, contentType: null } });
      await utente.save();
    }

    req.session.user = { id: utente._id, nome: utente.nome, username: utente.username };
    req.session.fingerprint = getFingerprint(req);

    res.json({ message: "Login Google effettuato", user: req.session.user });
  } catch {
    res.status(401).json({ message: "Token non valido" });
  }
});

app.post("/logout", checkFingerprint, csrfProtection, (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ message: "Errore logout" });
    res.clearCookie("connect.sid");
    res.json({ message: "Logout effettuato" });
  });
});

app.get("/api/auth-token", checkFingerprint, (req, res) => {
  const payload = { id: req.session.user.id, username: req.session.user.username, nome: req.session.user.nome };
  const token = jwt.sign(payload, process.env.JWT_SECRET || "dev-jwt-secret", { expiresIn: "15m" });
  res.json({ token });
});

// --- SPA + assets ---
app.use('/assets', express.static(path.join(distPath, 'assets')));
app.use(express.static(distPath));

app.use((req, res, next) => {
  if (req.path.startsWith('/api') || req.path.includes('.')) return next();
  res.sendFile(path.join(distPath, 'index.html'));
});

// --- Start ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log(`Server attivo su porta ${PORT}`));
