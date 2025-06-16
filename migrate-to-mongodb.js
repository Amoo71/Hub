const Database = require('better-sqlite3');
const mongoose = require('mongoose');
require('dotenv').config();

// SQLite database
const sqliteDb = new Database('requests.db', { verbose: console.log });

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://amo:amkamkamk@amslabs.kmunx80.mongodb.net/?retryWrites=true&w=majority&appName=amslabs';

// Define MongoDB schemas
const requestSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  username: { type: String, required: true },
  text: { type: String, required: true },
  designType: { type: String, required: true },
  idName: { type: String, required: true },
  time: { type: String, required: true },
  timestamp: { type: Number, required: true }
});

const antiTamperLogSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  timestamp: { type: Number, required: true },
  message: { type: String, required: true }
});

const albumItemSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  imageUrl: { type: String, default: '' },
  acc: { type: String, default: 'Empty' },
  pw: { type: String, default: 'Empty' },
  timestamp: { type: Number, required: true }
});

// Create models
const Request = mongoose.model('Request', requestSchema);
const AntiTamperLog = mongoose.model('AntiTamperLog', antiTamperLogSchema);
const AlbumItem = mongoose.model('AlbumItem', albumItemSchema);

async function migrateData() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // Migrate requests
    console.log('Migrating requests...');
    const requests = sqliteDb.prepare('SELECT * FROM requests').all();
    if (requests.length > 0) {
      console.log(`Found ${requests.length} requests to migrate`);
      await Request.deleteMany({}); // Clear existing data
      await Request.insertMany(requests);
      console.log('Requests migrated successfully');
    } else {
      console.log('No requests to migrate');
    }

    // Migrate anti-tamper logs
    console.log('Migrating anti-tamper logs...');
    const logs = sqliteDb.prepare('SELECT * FROM anti_tamper_logs').all();
    if (logs.length > 0) {
      console.log(`Found ${logs.length} anti-tamper logs to migrate`);
      await AntiTamperLog.deleteMany({}); // Clear existing data
      await AntiTamperLog.insertMany(logs);
      console.log('Anti-tamper logs migrated successfully');
    } else {
      console.log('No anti-tamper logs to migrate');
    }

    // Migrate album items
    console.log('Migrating album items...');
    const albums = sqliteDb.prepare('SELECT * FROM album_items').all();
    if (albums.length > 0) {
      console.log(`Found ${albums.length} album items to migrate`);
      
      // Process albums to ensure all required fields have values
      const processedAlbums = albums.map(album => ({
        ...album,
        id: album.id || Date.now().toString() + Math.random().toString(36).substring(2, 15),
        name: album.name || 'Unnamed Album',
        imageUrl: album.imageUrl || '',
        acc: album.acc || 'Empty',
        pw: album.pw || 'Empty',
        timestamp: album.timestamp || Date.now()
      }));
      
      await AlbumItem.deleteMany({}); // Clear existing data
      await AlbumItem.insertMany(processedAlbums);
      console.log('Album items migrated successfully');
    } else {
      console.log('No album items to migrate');
    }

    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    // Close connections
    mongoose.disconnect();
    sqliteDb.close();
  }
}

migrateData(); 