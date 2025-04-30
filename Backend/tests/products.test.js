const request = require('supertest');
const mongoose = require('mongoose');
const express = require('express');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Product = require('../models/Product');
const productRoutes = require('../routes/products');
const { protect, authorize } = require('../middleware/auth');

// Setup test app
const app = express();
app.use(bodyParser.json());

// Mock the auth middleware for testing
jest.mock('../middleware/auth', () => {
  const originalModule = jest.requireActual('../middleware/auth');
  return {
    protect: jest.fn((req, res, next) => {
      if (!req.user) {
        req.user = { id: 'mockUserId', role: 'customer' };
      }
      next();
    }),
    authorize: jest.fn(() => (req, res, next) => next())
  };
});

app.use('/api/products', productRoutes);

// Import test setup
require('./setup');

describe('Products API', () => {
  let retailerId;
  let retailerToken;
  let productId;

  beforeEach(async () => {
    // Reset mocks before each test
    protect.mockClear();
    authorize.mockClear();
    
    // Create a retailer user
    const retailer = new User({
      name: 'Test Retailer',
      phone: '1234567890',
      email: 'retailer@example.com',
      password: 'password123',
      role: 'retailer'
    });
    await retailer.save();
    retailerId = retailer._id;
    
    // Generate token
    retailerToken = jwt.sign(
      { id: retailerId, role: 'retailer' },
      process.env.JWT_SECRET || 'secretKey',
      { expiresIn: '1d' }
    );

    // Create a test product
    const product = new Product({
      name: 'Test Product',
      description: 'Test description',
      category: 'Test Category',
      price: 19.99,
      quantity: 10,
      expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      retailer: retailerId
    });
    await product.save();
    productId = product._id;
  });

  describe('GET /api/products', () => {
    it('should get all products', async () => {
      const response = await request(app)
        .get('/api/products');

      expect(response.status).toBe(200);
      expect(response.body.success).toBeTruthy();
      expect(response.body.count).toBe(1);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].name).toBe('Test Product');
    });
  });

  describe('GET /api/products/:id', () => {
    it('should get a single product by ID', async () => {
      const response = await request(app)
        .get(`/api/products/${productId}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBeTruthy();
      expect(response.body.data.name).toBe('Test Product');
      expect(response.body.data.price).toBe(19.99);
    });

    it('should return 404 for non-existent product', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .get(`/api/products/${fakeId}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBeFalsy();
    });
  });

  describe('POST /api/products', () => {
    it('should create a new product for retailer', async () => {
      // Set req.user for this test
      protect.mockImplementationOnce((req, res, next) => {
        req.user = { id: retailerId.toString(), role: 'retailer' };
        next();
      });
      
      const newProduct = {
        name: 'New Product',
        description: 'New Description',
        category: 'New Category',
        price: 29.99,
        quantity: 5,
        expiryDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000) // 15 days from now
      };

      const response = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${retailerToken}`)
        .send(newProduct);

      expect(response.status).toBe(201);
      expect(response.body.success).toBeTruthy();
      expect(response.body.data.name).toBe(newProduct.name);
      expect(response.body.data.price).toBe(newProduct.price);
    });
  });

  describe('PATCH /api/products/:id/quantity', () => {
    it('should update product quantity', async () => {
      // Set req.user for this test
      protect.mockImplementationOnce((req, res, next) => {
        req.user = { id: retailerId.toString(), role: 'retailer' };
        next();
      });

      const response = await request(app)
        .patch(`/api/products/${productId}/quantity`)
        .set('Authorization', `Bearer ${retailerToken}`)
        .send({ quantity: 15 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBeTruthy();
      expect(response.body.data.quantity).toBe(15);
    });
  });

  describe('PATCH /api/products/:id/discount', () => {
    it('should apply discount to a product', async () => {
      // Set req.user for this test
      protect.mockImplementationOnce((req, res, next) => {
        req.user = { id: retailerId.toString(), role: 'retailer' };
        next();
      });

      const response = await request(app)
        .patch(`/api/products/${productId}/discount`)
        .set('Authorization', `Bearer ${retailerToken}`)
        .send({ discountPercentage: 20 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBeTruthy();
      expect(response.body.data.discountPercentage).toBe(20);
      expect(response.body.data.isDiscounted).toBe(true);
    });
  });

  describe('GET /api/products/sale/discounted', () => {
    it('should get discounted products', async () => {
      // Create a discounted product
      const discountedProduct = new Product({
        name: 'Discounted Product',
        description: 'Discounted description',
        category: 'Test Category',
        price: 9.99,
        quantity: 5,
        expiryDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days from now
        retailer: retailerId,
        discountPercentage: 15,
        isDiscounted: true
      });
      await discountedProduct.save();

      const response = await request(app)
        .get('/api/products/sale/discounted');

      expect(response.status).toBe(200);
      expect(response.body.success).toBeTruthy();
      expect(response.body.count).toBe(1);
      expect(response.body.data[0].name).toBe('Discounted Product');
      expect(response.body.data[0].discountPercentage).toBe(15);
    });
  });
}); 