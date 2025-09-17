// index.js — performance tuned
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

const sharp = require("sharp");

const app = express();
const distPath = path.join(__dirname, "dist");

// ===== OAuth / Multer =====
const CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID ||
  "42592859457-ausft7g5gohk7mf96st2047ul9rk8o0v.apps.googleusercontent.com";
const client = new OAuth2Client(CLIENT_ID);
const upload = multer({ storage: multer.memoryStorage() });

// ===== CORS =====
const allowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:3000",
  "https://be-poli-pxil.onrender.com",
  "https://bepoli.onrender.com",
];
app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (!allowedOrigins.includes(origin)) {
        return cb(new Error(`CORS policy non permette l'origine ${origin}`), false);
      }
      cb(null, true);
    },
    credentials: true,
  })
);

// ===== Core middleware =====

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set("etag", "strong");
app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev-secret",
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      maxAge: 1000 * 60 * 30,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // ⚠️ true in prod
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax", // ⚠️ none in prod per cross-domain
    },
  })
);

// ===== CSRF =====
const csrfProtection = csrf({
  cookie: true,
  value: (req) =>
    req.headers["x-csrf-token"] ||
    req.headers["csrf-token"] ||
    (req.body && req.body._csrf) ||
    (req.query && req.query._csrf),
});

// ===== DB =====
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("Connesso a MongoDB"))
  .catch((err) => console.error("Connessione fallita:", err));

// ===== Schemi e modelli =====
const utenteSchema = new mongoose.Schema({
  nome: String,
  username: { type: String, required: true, trim: true },
  password: String,
  bio: String,
  profilePic: { data: Buffer, contentType: String },
  followers: [{ type: mongoose.Schema.Types.ObjectId, ref: "Utente" }],
  following: [{ type: mongoose.Schema.Types.ObjectId, ref: "Utente" }],
  utentiRecenti: [{ type: mongoose.Schema.Types.ObjectId, ref: "Utente" }],
});
utenteSchema.index(
  { username: 1 },
  { unique: true, partialFilterExpression: { username: { $exists: true, $type: "string", $ne: "" } } }
);
utenteSchema.index({ followers: 1 });
utenteSchema.index({ following: 1 });

const postSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "Utente" },
  desc: String,
  image: { data: Buffer, contentType: String },
  location: String,
  createdAt: { type: Date, default: Date.now },
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "Utente" }],
  comments: [
    {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "Utente" },
      text: String,
      location: String,
      createdAt: { type: Date, default: Date.now },
    },
  ],
});
postSchema.index({ createdAt: -1 });
postSchema.index({ userId: 1, createdAt: -1 });
postSchema.index({ location: 1, createdAt: -1 });

const Utente = mongoose.model("Utente", utenteSchema);
const Post = mongoose.model("Post", postSchema);

// ===== Helpers =====
function getFingerprint(req) {
  return req.headers["user-agent"] || "";
}
function checkFingerprint(req, res, next) {
  if (!req.session.user) return res.status(401).json({ message: "Non autorizzato" });
  const currentFp = getFingerprint(req);
  const savedFp = req.session.fingerprint;
  if (!savedFp) {
    req.session.fingerprint = currentFp;
    return next();
  }
  if (savedFp !== currentFp) {
    req.session.destroy((err) => {
      if (err) console.error("Errore distruggendo sessione:", err);
      return res.status(403).json({ message: "Sessione invalida, login richiesto." });
    });
  } else next();
}

// ===== Routes =====

// CSRF token
app.get("/csrf-token", (req, res) => {
  res.json({ csrfToken: req.csrfToken ? req.csrfToken() : null });
});

// Auth Google
app.post("/auth/google", async (req, res) => {
  try {
    const ticket = await client.verifyIdToken({
      idToken: req.body.id_token,
      audience: CLIENT_ID,
    });
    const payload = ticket.getPayload();
    let utente = await Utente.findOne({ username: payload.email });
    if (!utente) {
      utente = await Utente.create({
        nome: payload.name,
        username: payload.email,
        bio: "Nuovo utente",
      });
    }
    req.session.user = utente;
    req.session.fingerprint = getFingerprint(req);
    res.json({ user: utente });
  } catch (err) {
    console.error("Errore login Google:", err);
    res.status(500).json({ message: "Errore login Google" });
  }
});

// Login
app.post("/login", csrfProtection, async (req, res) => {
  try {
    const { username, password } = req.body;
    const utente = await Utente.findOne({ username });
    if (!utente) return res.status(400).json({ message: "Utente non trovato" });
    const match = await bcrypt.compare(password, utente.password);
    if (!match) return res.status(400).json({ message: "Password errata" });
    req.session.user = utente;
    req.session.fingerprint = getFingerprint(req);
    res.json({ user: utente });
  } catch (err) {
    res.status(500).json({ message: "Errore login" });
  }
});

// Logout
app.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ message: "Errore logout" });
    res.json({ message: "Logout effettuato" });
  });
});

// Register
app.post("/register", csrfProtection, async (req, res) => {
  try {
    const hashed = await bcrypt.hash(req.body.password, 10);
    const utente = await Utente.create({
      nome: req.body.nome,
      username: req.body.username,
      password: hashed,
      bio: req.body.bio || "",
    });
    req.session.user = utente;
    req.session.fingerprint = getFingerprint(req);
    res.json({ user: utente });
  } catch (err) {
    res.status(500).json({ message: "Errore registrazione" });
  }
});

// Profilo
app.get("/profile/:id", checkFingerprint, async (req, res) => {
  try {
    const utente = await Utente.findById(req.params.id).select("-password");
    res.json(utente);
  } catch {
    res.status(500).json({ message: "Errore caricando profilo" });
  }
});

// Update profilo
app.post(
  "/profile/update",
  checkFingerprint,
  upload.single("profilePic"),
  csrfProtection,
  async (req, res) => {
    try {
      const userId = req.session.user._id;
      const updates = { nome: req.body.nome, bio: req.body.bio };
      if (req.file) {
        const resized = await sharp(req.file.buffer).resize(256, 256).jpeg({ quality: 80 }).toBuffer();
        updates.profilePic = { data: resized, contentType: "image/jpeg" };
      }
      const utente = await Utente.findByIdAndUpdate(userId, updates, { new: true });
      res.json({ user: utente });
    } catch {
      res.status(500).json({ message: "Errore aggiornando profilo" });
    }
  }
);

// Post create
app.post(
  "/posts",
  checkFingerprint,
  upload.single("image"),
  csrfProtection,
  async (req, res) => {
    try {
      let img = null;
      if (req.file) {
        const resized = await sharp(req.file.buffer).resize(1024).jpeg({ quality: 80 }).toBuffer();
        img = { data: resized, contentType: "image/jpeg" };
      }
      const post = await Post.create({
        userId: req.session.user._id,
        desc: req.body.desc,
        image: img,
        location: req.body.location,
      });
      res.json(post);
    } catch {
      res.status(500).json({ message: "Errore creando post" });
    }
  }
);

// Feed
app.get("/posts", checkFingerprint, async (req, res) => {
  try {
    const posts = await Post.find()
      .populate("userId", "username profilePic")
      .sort({ createdAt: -1 })
      .limit(20);
    res.json(posts);
  } catch {
    res.status(500).json({ message: "Errore caricando feed" });
  }
});

// Like
app.post("/posts/:id/like", checkFingerprint, csrfProtection, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post non trovato" });
    const uid = req.session.user._id;
    const i = post.likes.indexOf(uid);
    if (i === -1) post.likes.push(uid);
    else post.likes.splice(i, 1);
    await post.save();
    res.json(post);
  } catch {
    res.status(500).json({ message: "Errore like" });
  }
});

// Commento
app.post("/posts/:id/comment", checkFingerprint, csrfProtection, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    post.comments.push({
      userId: req.session.user._id,
      text: req.body.text,
      location: req.body.location,
    });
    await post.save();
    res.json(post);
  } catch {
    res.status(500).json({ message: "Errore commento" });
  }
});

// Follow
app.post("/follow/:id", checkFingerprint, csrfProtection, async (req, res) => {
  try {
    const target = await Utente.findById(req.params.id);
    const current = await Utente.findById(req.session.user._id);
    if (!target || !current) return res.status(404).json({ message: "Utente non trovato" });
    const idx = current.following.indexOf(target._id);
    if (idx === -1) {
      current.following.push(target._id);
      target.followers.push(current._id);
    } else {
      current.following.splice(idx, 1);
      target.followers.pull(current._id);
    }
    await current.save();
    await target.save();
    res.json({ current, target });
  } catch {
    res.status(500).json({ message: "Errore follow/unfollow" });
  }
});

// Token JWT (opzionale)
app.get("/api/auth-token", checkFingerprint, (req, res) => {
  try {
    const token = jwt.sign(
      { id: req.session.user._id, username: req.session.user.username },
      process.env.JWT_SECRET || "jwt-secret",
      { expiresIn: "1h" }
    );
    res.json({ token });
  } catch {
    res.status(500).json({ message: "Errore generando token" });
  }
});

// ===== Static + SPA fallback =====
app.use("/assets", express.static(path.join(distPath, "assets")));
app.use(express.static(distPath));

app.get("/api/hello", (req, res) => res.json({ message: "Hello World" }));

app.use((req, res, next) => {
  if (req.path.startsWith("/api") || req.path.includes(".")) return next();
  res.sendFile(path.join(distPath, "index.html"));
});

// ===== Avvio =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log(`Server attivo su porta ${PORT}`));
