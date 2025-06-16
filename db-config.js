const mongoose = require('mongoose');
require('dotenv').config();

// Lese die Verbindungsinformationen aus der Umgebung
const MONGODB_URI = process.env.MONGODB_URI;

// Debug-Ausgabe für fehlersuche
console.log('MongoDB URI vorhanden:', !!MONGODB_URI);
if (!MONGODB_URI) {
  console.error('MONGODB_URI fehlt in den Umgebungsvariablen!');
}

// Verbindungsoptionen für MongoDB/Mongoose
const DB_OPTIONS = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 10000,
  autoIndex: true,
};

// Verbindungsstatus
let isConnected = false;
let dbInstance = null;

// Schemaerstellung
const createRequestSchema = () => {
  return new mongoose.Schema({
    id: String,
    username: String,
    text: String,
    designType: String,
    idName: String,
    time: String,
    timestamp: Number
  }, { 
    timestamps: true, 
    collection: 'requests',
    strict: false
  });
};

const createAntiTamperLogSchema = () => {
  return new mongoose.Schema({
    id: String,
    timestamp: Number,
    message: String
  }, { 
    timestamps: true, 
    collection: 'anti_tamper_logs',
    strict: false
  });
};

const createAlbumItemSchema = () => {
  return new mongoose.Schema({
    id: String,
    name: String,
    imageUrl: String,
    acc: String,
    pw: String,
    timestamp: Number
  }, { 
    timestamps: true, 
    collection: 'album_items',
    strict: false
  });
};

// Models initialisieren
const getModels = () => {
  // Models nur einmal erstellen
  const Request = mongoose.models.Request || mongoose.model('Request', createRequestSchema());
  const AntiTamperLog = mongoose.models.AntiTamperLog || mongoose.model('AntiTamperLog', createAntiTamperLogSchema());
  const AlbumItem = mongoose.models.AlbumItem || mongoose.model('AlbumItem', createAlbumItemSchema());

  return {
    Request,
    AntiTamperLog,
    AlbumItem
  };
};

// Verbindung zur MongoDB herstellen
async function connectToDatabase() {
  try {
    // Wenn wir bereits verbunden sind, vorhandene Verbindung zurückgeben
    if (isConnected && dbInstance) {
      console.log('=> Nutze bestehende DB-Verbindung');
      return { instance: dbInstance, models: getModels() };
    }

    console.log('=> Stelle neue Datenbankverbindung her');

    // Prüfe, ob die Verbindungs-URL vorhanden ist
    if (!MONGODB_URI) {
      throw new Error('MONGODB_URI Umgebungsvariable fehlt');
    }

    // Verbindung nur herstellen, wenn noch keine besteht
    if (!dbInstance) {
      dbInstance = await mongoose.connect(MONGODB_URI, DB_OPTIONS);
      isConnected = true;
      console.log('=> MongoDB-Verbindung erfolgreich hergestellt');
    }

    // Erfolgreiche Verbindung zurückgeben
    return { instance: dbInstance, models: getModels() };
  } catch (error) {
    console.error('=> MongoDB-Verbindungsfehler:', error.message);
    isConnected = false;
    dbInstance = null;
    return { error: error.message, models: null };
  }
}

module.exports = {
  connectToDatabase,
  models: getModels(),
  isConnected: () => isConnected
}; 