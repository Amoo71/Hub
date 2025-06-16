const mongoose = require('mongoose');
const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config();

// MongoDB Connection String
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://amo:<db_password>@amslabs.kmunx80.mongodb.net/?retryWrites=true&w=majority&appName=amslabs';
const DB_PASSWORD = process.env.DB_PASSWORD || '';

// Fix password placeholder
const uri = MONGODB_URI.replace('<db_password>', DB_PASSWORD);

// MongoDB Client
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// Database connection
let db;

async function connectToDatabase() {
  try {
    await client.connect();
    console.log("Connected to MongoDB");
    db = client.db("trnt");
    
    // Create collections if they don't exist
    await db.createCollection("requests");
    await db.createCollection("anti_tamper_logs");
    await db.createCollection("album_items");
    
    return db;
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
    throw error;
  }
}

// Handle application shutdown
process.on('SIGINT', async () => {
  try {
    await client.close();
    console.log('MongoDB connection closed');
    process.exit(0);
  } catch (error) {
    console.error('Error closing MongoDB connection:', error);
    process.exit(1);
  }
});

module.exports = { 
  connectToDatabase,
  getDb: () => db,
  client
}; 