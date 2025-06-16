const mongoose = require('mongoose');
require('dotenv').config();

// MongoDB-Verbindungsstring (wird aus Umgebungsvariablen geladen oder kann direkt hier eingetragen werden)
const MONGODB_URI = process.env.MONGODB_URI;

// Überprüfe, ob die MongoDB-URI gesetzt ist
if (!MONGODB_URI) {
  console.error('ACHTUNG: MONGODB_URI nicht gesetzt. Bitte als Umgebungsvariable konfigurieren.');
}

// globale mongoose Promise verwenden
mongoose.Promise = global.Promise;

// Verbindungsstatus
let isConnected = false;
let cachedConnection = null;

// Verbindung zur MongoDB herstellen
async function connectToDatabase() {
  try {
    if (isConnected) {
      console.log('=> Verwende existierende Datenbankverbindung');
      return cachedConnection;
    }

    console.log('=> Neue Datenbankverbindung herstellen mit URI:', 
      MONGODB_URI ? `${MONGODB_URI.substring(0, 20)}...` : 'Keine URI angegeben');
    
    if (!MONGODB_URI) {
      throw new Error('MongoDB-Verbindungsstring fehlt. Bitte MONGODB_URI als Umgebungsvariable setzen.');
    }

    const opts = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000 // Timeout nach 5 Sekunden
    };

    const connection = await mongoose.connect(MONGODB_URI, opts);
    cachedConnection = connection;
    isConnected = true;
    console.log('=> Datenbankverbindung erfolgreich hergestellt');
    return connection;
  } catch (error) {
    console.error('=> Fehler bei der MongoDB-Verbindung:', error.message);
    return null; // Statt Exception werfen, null zurückgeben für graceful error handling
  }
}

// Modell für Requests
const RequestSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  username: { type: String, required: true },
  text: { type: String, required: true },
  designType: { type: String, required: true },
  idName: { type: String, required: true },
  time: { type: String, required: true },
  timestamp: { type: Number, required: true }
}, { 
  timestamps: true, 
  collection: 'requests' 
});

// Modell für Anti-Tamper-Logs
const AntiTamperLogSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  timestamp: { type: Number, required: true },
  message: { type: String, required: true }
}, { 
  timestamps: true, 
  collection: 'anti_tamper_logs' 
});

// Modell für Album-Items
const AlbumItemSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  imageUrl: { type: String, required: true },
  acc: { type: String, required: true },
  pw: { type: String, required: true },
  timestamp: { type: Number, required: true }
}, { 
  timestamps: true, 
  collection: 'album_items' 
});

// Modelle erstellen - Mit Prüfung, ob sie bereits existieren
const Request = mongoose.models.Request || mongoose.model('Request', RequestSchema);
const AntiTamperLog = mongoose.models.AntiTamperLog || mongoose.model('AntiTamperLog', AntiTamperLogSchema);
const AlbumItem = mongoose.models.AlbumItem || mongoose.model('AlbumItem', AlbumItemSchema);

module.exports = {
  connectToDatabase,
  models: {
    Request,
    AntiTamperLog,
    AlbumItem
  },
  isConnected: () => isConnected
}; 