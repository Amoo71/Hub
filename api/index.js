const express = require('express');
const bodyParser = require('body-parser');
const { connectDB, Request, AntiTamperLog, AlbumItem } = require('../db-mongo');

// Connect to MongoDB
connectDB();

const app = express();

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// API Routes
// Get all requests
app.get('/api/requests', async (req, res) => {
    try {
        const requests = await Request.find().sort({ timestamp: -1 });
        res.json(requests);
    } catch (error) {
        console.error('Error fetching requests:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Add a new request
app.post('/api/requests', async (req, res) => {
    try {
        const newRequest = new Request(req.body);
        await newRequest.save();
        res.status(201).json(newRequest);
    } catch (error) {
        console.error('Error adding request:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete a request
app.delete('/api/requests/:id', async (req, res) => {
    try {
        const result = await Request.findOneAndDelete({ id: req.params.id });
        
        if (!result) {
            return res.status(404).json({ error: 'Request not found' });
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting request:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Anti-tamper logs routes
app.get('/api/anti-tamper-logs', async (req, res) => {
    try {
        const logs = await AntiTamperLog.find().sort({ timestamp: -1 });
        res.json(logs);
    } catch (error) {
        console.error('Error fetching anti-tamper logs:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.delete('/api/anti-tamper-logs', async (req, res) => {
    try {
        await AntiTamperLog.deleteMany({});
        res.json({ success: true });
    } catch (error) {
        console.error('Error clearing anti-tamper logs:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.delete('/api/anti-tamper-logs/:id', async (req, res) => {
    try {
        const result = await AntiTamperLog.findOneAndDelete({ id: req.params.id });
        
        if (!result) {
            return res.status(404).json({ error: 'Log not found' });
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting anti-tamper log:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Album items routes
app.get('/api/album-items', async (req, res) => {
    try {
        const albumItems = await AlbumItem.find().sort({ timestamp: -1 });
        res.json(albumItems);
    } catch (error) {
        console.error('Error fetching album items:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/album-items', async (req, res) => {
    try {
        const newAlbumItem = new AlbumItem(req.body);
        await newAlbumItem.save();
        res.status(201).json(newAlbumItem);
    } catch (error) {
        console.error('Error adding album item:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.put('/api/album-items/:id', async (req, res) => {
    try {
        const result = await AlbumItem.findOneAndUpdate(
            { id: req.params.id },
            req.body,
            { new: true }
        );
        
        if (!result) {
            return res.status(404).json({ error: 'Album item not found' });
        }
        
        res.json(result);
    } catch (error) {
        console.error('Error updating album item:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.delete('/api/album-items/:id', async (req, res) => {
    try {
        const result = await AlbumItem.findOneAndDelete({ id: req.params.id });
        
        if (!result) {
            return res.status(404).json({ error: 'Album item not found' });
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting album item:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Export the Express API
module.exports = app; 