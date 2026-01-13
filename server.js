require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:", "http:"],
      connectSrc: ["'self'"]
    }
  }
}));

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Rate limiting - 6 attempts, 5 minute timeout
const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 6,
  message: { error: 'Too many attempts. Wait 5 minutes.' }
});

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30
});

// In-memory storage
let credentials = [
  {
    id: '1',
    cover: 'https://images.unsplash.com/photo-1633356122544-f134324a6cee?w=400',
    acc: 'demo@example.com',
    pass: 'DemoPassword123',
    reported: false,
    order: 0
  },
  {
    id: '2',
    cover: 'https://images.unsplash.com/photo-1614680376593-902f74cf0d41?w=400',
    acc: 'admin@vault.com',
    pass: 'SecurePass456',
    reported: false,
    order: 1
  }
];

// Hashed codes
const MAIN_CODE_HASH = bcrypt.hashSync(process.env.MAIN_ACCESS_CODE || 'vault2024', 10);
const ADMIN_CODE_HASH = bcrypt.hashSync(process.env.ADMIN_CODE || '666777', 10);
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-key-in-production-must-be-very-long';

// Middleware to verify JWT
function verifyToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Access denied' });
  }
  
  try {
    const verified = jwt.verify(token, JWT_SECRET);
    req.user = verified;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// Middleware to verify admin
function verifyAdmin(req, res, next) {
  if (!req.user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// Auth endpoints
app.post('/api/auth/main', authLimiter, async (req, res) => {
  try {
    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({ error: 'Code required' });
    }
    
    const isValid = await bcrypt.compare(code, MAIN_CODE_HASH);
    
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid code' });
    }
    
    const token = jwt.sign({ access: 'main', isAdmin: false }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, message: 'Access granted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/admin', authLimiter, [verifyToken], async (req, res) => {
  try {
    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({ error: 'Admin code required' });
    }
    
    const isValid = await bcrypt.compare(code, ADMIN_CODE_HASH);
    
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid admin code' });
    }
    
    const token = jwt.sign({ access: 'admin', isAdmin: true }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, message: 'Admin access granted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Credential endpoints
app.get('/api/credentials', apiLimiter, verifyToken, (req, res) => {
  try {
    // Sort by order
    const sorted = [...credentials].sort((a, b) => (a.order || 0) - (b.order || 0));
    const safeCredentials = sorted.map(cred => ({
      id: cred.id,
      cover: cred.cover,
      acc: cred.acc,
      reported: cred.reported || false,
      order: cred.order || 0
    }));
    res.json(safeCredentials);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/credentials/:id', apiLimiter, verifyToken, (req, res) => {
  try {
    const credential = credentials.find(c => c.id === req.params.id);
    
    if (!credential) {
      return res.status(404).json({ error: 'Credential not found' });
    }
    
    res.json({
      id: credential.id,
      cover: credential.cover,
      acc: credential.acc,
      pass: credential.pass,
      reported: credential.reported || false
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Report credential as not working
app.post('/api/credentials/:id/report', apiLimiter, verifyToken, (req, res) => {
  try {
    const credential = credentials.find(c => c.id === req.params.id);
    
    if (!credential) {
      return res.status(404).json({ error: 'Credential not found' });
    }
    
    credential.reported = true;
    res.json({ message: 'Credential reported as not working' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin: Clear report
app.delete('/api/credentials/:id/report', apiLimiter, verifyToken, verifyAdmin, (req, res) => {
  try {
    const credential = credentials.find(c => c.id === req.params.id);
    
    if (!credential) {
      return res.status(404).json({ error: 'Credential not found' });
    }
    
    credential.reported = false;
    res.json({ message: 'Report cleared' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/credentials', apiLimiter, verifyToken, verifyAdmin, (req, res) => {
  try {
    const { cover, acc, pass } = req.body;
    
    if (!cover || !acc || !pass) {
      return res.status(400).json({ error: 'All fields required' });
    }
    
    const newCredential = {
      id: Date.now().toString(),
      cover,
      acc,
      pass,
      reported: false,
      order: credentials.length
    };
    
    credentials.push(newCredential);
    res.json({ message: 'Credential added', id: newCredential.id });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Update order of credentials
app.put('/api/credentials/order', apiLimiter, verifyToken, verifyAdmin, (req, res) => {
  try {
    const { order } = req.body; // array of IDs in new order
    
    if (!Array.isArray(order)) {
      return res.status(400).json({ error: 'Order must be an array' });
    }
    
    // Update order property for each credential
    order.forEach((id, index) => {
      const cred = credentials.find(c => c.id === id);
      if (cred) {
        cred.order = index;
      }
    });
    
    res.json({ message: 'Order updated' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/credentials/:id', apiLimiter, verifyToken, verifyAdmin, (req, res) => {
  try {
    const { cover, acc, pass } = req.body;
    const index = credentials.findIndex(c => c.id === req.params.id);
    
    if (index === -1) {
      return res.status(404).json({ error: 'Credential not found' });
    }
    
    credentials[index] = {
      ...credentials[index],
      cover: cover || credentials[index].cover,
      acc: acc || credentials[index].acc,
      pass: pass || credentials[index].pass
    };
    
    res.json({ message: 'Credential updated' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/credentials/:id', apiLimiter, verifyToken, verifyAdmin, (req, res) => {
  try {
    const index = credentials.findIndex(c => c.id === req.params.id);
    
    if (index === -1) {
      return res.status(404).json({ error: 'Credential not found' });
    }
    
    credentials.splice(index, 1);
    res.json({ message: 'Credential deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Secure Vault running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
