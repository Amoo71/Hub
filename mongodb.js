const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://amo:amkamkamk@amslabs.kmunx80.mongodb.net/?retryWrites=true&w=majority&appName=amslabs';

// Define schemas
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

// Connect to MongoDB
async function connectToDatabase() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // Initialize with sample data if collections are empty
    await initializeCollections();
    
    return {
      Request,
      AntiTamperLog,
      AlbumItem
    };
  } catch (error) {
    console.error('MongoDB connection error:', error);
    throw error;
  }
}

// Initialize collections with sample data if empty
async function initializeCollections() {
  // Add initial Amo request if collection is empty
  const requestCount = await Request.countDocuments();
  if (requestCount === 0) {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const time = `${hours}:${minutes}`;
    
    await Request.create({
      id: Date.now().toString(),
      username: 'Amo',
      text: 'Amo\'s initial fixed request.',
      designType: 'owner',
      idName: 'Amo',
      time: time,
      timestamp: now.getTime()
    });
    
    console.log('Added initial request');
  }
  
  // Add sample album if collection is empty
  const albumCount = await AlbumItem.countDocuments();
  if (albumCount === 0) {
    const now = Date.now();
    
    await AlbumItem.create({
      id: now.toString(),
      name: 'Sample Album',
      imageUrl: '',
      acc: 'SAMPLE-ACC-001',
      pw: 'SAMPLE-PW-001',
      timestamp: now
    });
    
    console.log('Added sample album');
  }
}

module.exports = {
  connectToDatabase,
  models: {
    Request,
    AntiTamperLog,
    AlbumItem
  }
}; 