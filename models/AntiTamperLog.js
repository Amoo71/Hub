const mongoose = require('mongoose');

const AntiTamperLogSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true
  },
  timestamp: {
    type: Number,
    required: true
  },
  message: {
    type: String,
    required: true
  }
});

module.exports = mongoose.model('AntiTamperLog', AntiTamperLogSchema); 