const express = require('express');
const bodyParser = require('body-parser');
const productRoutes = require('../routes/products');
const inventoryRoutes = require('../routes/inventory');
const surplusRoutes = require('../routes/surplus');
const { protect, authorize } = require('../middleware/auth');

// Mock the auth middleware for testing
jest.mock('../middleware/auth', () => {
  return {
    protect: jest.fn((req, res, next) => {
      if (!req.user) {
        req.user = { id: 'mockUserId', role: 'retailer' };
      }
      next();
    }),
    authorize: jest.fn(() => (req, res, next) => next())
  };
});

// Create the app
const app = express();
app.use(bodyParser.json());

// Mount routes
app.use('/api/products', productRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/surplus', surplusRoutes);

module.exports = {
  app,
  protect,
  authorize
}; 