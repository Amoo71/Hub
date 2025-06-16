const mongoose = require('mongoose');

const AlbumItemSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  imageUrl: {
    type: String,
    default: ''
  },
  acc: {
    type: String,
    default: 'Empty'
  },
  pw: {
    type: String,
    default: 'Empty'
  },
  timestamp: {
    type: Number,
    required: true
  }
});

module.exports = mongoose.model('AlbumItem', AlbumItemSchema); 