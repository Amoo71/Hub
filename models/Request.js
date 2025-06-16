const mongoose = require('mongoose');

const RequestSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true
  },
  username: {
    type: String,
    required: true
  },
  text: {
    type: String,
    required: true
  },
  designType: {
    type: String,
    required: true
  },
  idName: {
    type: String,
    required: true
  },
  time: {
    type: String,
    required: true
  },
  timestamp: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    default: 'pending'
  }
});

module.exports = mongoose.model('Request', RequestSchema); 