const mongoose = require('mongoose');
require('dotenv').config();

// MongoDB connection
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error connecting to MongoDB: ${error.message}`);
    process.exit(1);
  }
};

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

module.exports = {
  connectDB,
  Request,
  AntiTamperLog,
  AlbumItem
}; 