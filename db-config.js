const mongoose = require('mongoose');
require('dotenv').config();

// MongoDB-Verbindungsstring (wird aus Umgebungsvariablen geladen oder kann direkt hier eingetragen werden)
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://<username>:<password>@<cluster-url>/<database-name>?retryWrites=true&w=majority';

// Verbindung zur MongoDB herstellen
async function connectToDatabase() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('Verbindung zur MongoDB erfolgreich hergestellt');
    return mongoose.connection;
  } catch (error) {
    console.error('Fehler bei der MongoDB-Verbindung:', error);
    process.exit(1);
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
});

// Modell für Anti-Tamper-Logs
const AntiTamperLogSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  timestamp: { type: Number, required: true },
  message: { type: String, required: true }
});

// Modell für Album-Items
const AlbumItemSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  imageUrl: { type: String, required: true },
  acc: { type: String, required: true },
  pw: { type: String, required: true },
  timestamp: { type: Number, required: true }
});

// Modelle erstellen
const Request = mongoose.models.Request || mongoose.model('Request', RequestSchema);
const AntiTamperLog = mongoose.models.AntiTamperLog || mongoose.model('AntiTamperLog', AntiTamperLogSchema);
const AlbumItem = mongoose.models.AlbumItem || mongoose.model('AlbumItem', AlbumItemSchema);

module.exports = {
  connectToDatabase,
  models: {
    Request,
    AntiTamperLog,
    AlbumItem
  }
}; 