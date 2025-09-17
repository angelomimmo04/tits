require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcrypt");
const path = require("path");
const multer = require("multer");
const session = require("express-session");
const cookieParser = require("cookie-parser");
const { OAuth2Client } = require("google-auth-library");
const jwt = require("jsonwebtoken");

const distPath = path.join(__dirname, "dist");

const CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID ||
  "42592859457-ausft7g5gohk7mf96st2047ul9rk8o0v.apps.googleusercontent.com";
const client = new OAuth2Client(CLIENT_ID);

const storage = multer.memoryStorage();
const upload = multer({ storage });

const app = express();

// --- Middleware ---
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "https://be-poli-pxil.onrender.com", // frontend prod
  "https://bepoli.onrender.com",       // backend prod
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true); // consenti richieste server-to-server
      if (!allowedOrigins.includes(origin)) {
        return callback(
          new Error(`CORS policy non permette l'origine ${origin}`),
          false
        );
      }
      return callback(null, true);
    },
    credentials: true,
  })
);

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev-secret",
    resave: false,
    saveUninitialized: true,
    rolling: true,
    cookie: {
      maxAge: 1000 * 60 * 30, // 30 min
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "none",
    },
  })
);

// --- Database ---
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("Connesso a MongoDB"))
  .catch((err) => console.error("Connessione fallita:", err));

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
const Post = mongoose.model("Post", postSchema);

// --- Utils ---
function getFingerprint(req) {
  return req.headers["user-agent"] || "";
}

function checkFingerprint(req, res, next) {
  if (!req.session.user)
    return res.status(401).json({ message: "Non autorizzato" });

  const currentFp = getFingerprint(req);
  const savedFp = req.session.fingerprint;

  if (!savedFp) {
    req.session.fingerprint = currentFp;
    return next();
  }

  if (savedFp !== currentFp) {
    req.session.destroy((err) => {
      if (err) console.error("Errore distruggendo sessione:", err);
      return res
        .status(403)
        .json({ message: "Sessione invalida, login richiesto." });
    });
  } else {
    next();
  }
}

// --- Rotte autenticazione ---
app.post("/register", async (req, res) => {
  const { nome, username, password } = req.body;
  if (!nome || !username || !password)
    return res.status(400).json({ message: "Dati mancanti" });

  try {
    if (await Utente.findOne({ username }))
      return res.status(400).json({ message: "Username già esistente" });

    const hash = await bcrypt.hash(password, 10);
    const nuovoUtente = new Utente({
      nome,
      username,
      password: hash,
      bio: "",
      profilePic: { data: null, contentType: null },
    });
    await nuovoUtente.save();
    res.status(201).json({ message: "Registrazione completata" });
  } catch (err) {
    console.error("Errore register:", err);
    res.status(500).json({ message: "Errore server" });
  }
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ message: "Dati mancanti" });

  try {
    const utente = await Utente.findOne({ username });
    if (!utente || !(await bcrypt.compare(password, utente.password)))
      return res.status(400).json({ message: "Username o password errati" });

    req.session.user = {
      id: utente._id,
      nome: utente.nome,
      username: utente.username,
    };
    req.session.fingerprint = getFingerprint(req);
    res.json({ message: "Login riuscito", user: req.session.user });
  } catch (err) {
    console.error("Errore login:", err);
    res.status(500).json({ message: "Errore server" });
  }
});

app.post("/auth/google", async (req, res) => {
  const { id_token } = req.body;
  if (!id_token) return res.status(400).json({ message: "Token mancante" });

  try {
    const ticket = await client.verifyIdToken({
      idToken: id_token,
      audience: CLIENT_ID,
    });
    const payload = ticket.getPayload();

    let utente = await Utente.findOne({ username: payload.email });
    if (!utente) {
      utente = new Utente({
        nome: payload.name,
        username: payload.email,
        password: "",
        bio: "",
        profilePic: { data: null, contentType: null },
      });
      await utente.save();
    }

    req.session.user = {
      id: utente._id,
      nome: utente.nome,
      username: utente.username,
    };
    req.session.fingerprint = getFingerprint(req);

    res.json({ message: "Login Google effettuato", user: req.session.user });
  } catch (err) {
    console.error("Errore auth/google:", err);
    res.status(401).json({ message: "Token non valido" });
  }
});

app.post("/logout", checkFingerprint, (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Errore logout:", err);
      return res.status(500).json({ message: "Errore logout" });
    }
    res.clearCookie("connect.sid", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "none",
    });
    res.json({ message: "Logout effettuato" });
  });
});

app.get("/api/auth-token", checkFingerprint, (req, res) => {
  const payload = {
    id: req.session.user.id,
    username: req.session.user.username,
    nome: req.session.user.nome,
  };
  const token = jwt.sign(payload, process.env.JWT_SECRET || "dev-jwt-secret", {
    expiresIn: "15m",
  });
  res.json({ token });
});

// --- Rotte utenti ---
app.get("/api/user/:id", checkFingerprint, async (req, res) => {
  try {
    const utente = await Utente.findById(req.params.id).select("-password");
    if (!utente) return res.status(404).json({ message: "Utente non trovato" });
    res.json(utente);
  } catch (err) {
    res.status(500).json({ message: "Errore server" });
  }
});

app.put("/api/user/:id", checkFingerprint, upload.single("profilePic"), async (req, res) => {
  try {
    if (req.session.user.id !== req.params.id)
      return res.status(403).json({ message: "Non autorizzato" });

    const updateData = {
      nome: req.body.nome,
      bio: req.body.bio,
    };

    if (req.file) {
      updateData.profilePic = {
        data: req.file.buffer,
        contentType: req.file.mimetype,
      };
    }

    const utente = await Utente.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
    }).select("-password");

    res.json(utente);
  } catch (err) {
    res.status(500).json({ message: "Errore server" });
  }
});

// --- Rotte post ---
app.post("/api/posts", checkFingerprint, upload.single("image"), async (req, res) => {
  try {
    const nuovoPost = new Post({
      userId: req.session.user.id,
      desc: req.body.desc,
      location: req.body.location,
      image: req.file
        ? { data: req.file.buffer, contentType: req.file.mimetype }
        : null,
    });
    await nuovoPost.save();
    res.status(201).json(nuovoPost);
  } catch (err) {
    res.status(500).json({ message: "Errore server" });
  }
});

app.get("/api/posts", checkFingerprint, async (req, res) => {
  const { page = 1, pageSize = 10, location } = req.query;
  try {
    const query = location ? { location } : {};
    const posts = await Post.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(parseInt(pageSize))
      .populate("userId", "username nome profilePic");

    res.json(posts);
  } catch (err) {
    res.status(500).json({ message: "Errore server" });
  }
});

// --- SPA & Assets ---
app.use("/assets", express.static(path.join(distPath, "assets")));
app.use(express.static(distPath));

app.get("/api/hello", (req, res) => res.json({ message: "Hello World" }));

app.use((req, res, next) => {
  if (req.path.startsWith("/api") || req.path.includes(".")) return next();
  res.sendFile(path.join(distPath, "index.html"));
});

// --- Server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () =>
  console.log(`Server attivo su porta ${PORT}`)
);
