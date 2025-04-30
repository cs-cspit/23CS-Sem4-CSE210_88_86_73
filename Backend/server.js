const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const dotenv = require('dotenv');
const morgan = require('morgan');

// Load environment variables
dotenv.config();

// Import routes
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const inventoryRoutes = require('./routes/inventory');
const surplusRoutes = require('./routes/surplus');

// Initialize express app
const app = express();

// Middleware
app.use(cors({
    origin: ['http://127.0.0.1:5500', 'http://localhost:5500', 'http://0.0.0.0:5500'],
    credentials: true
}));
app.use(bodyParser.json());
app.use(morgan('dev'));

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI || 'mongodb+srv://shahniyati349:Niyati34@cluster0.jruqx.mongodb.net/smartshelf')
.then(() => console.log('MongoDB connected'))
.catch((err) => console.log('MongoDB connection error: ', err));

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/surplus', surplusRoutes);

// Basic route for testing
app.get('/', (req, res) => {
    res.json({ message: 'Welcome to Smart Shelf API' });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ 
        success: false, 
        message: 'Server Error', 
        error: process.env.NODE_ENV === 'production' ? 'An error occurred' : err.message 
    });
});

// 404 route
app.use((req, res) => {
    res.status(404).json({ success: false, message: 'Route not found' });
});

// Run the server
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
