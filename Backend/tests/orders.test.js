const request = require('supertest');
const mongoose = require('mongoose');
const express = require('express');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');
const orderRoutes = require('../routes/orders');
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

app.use('/api/orders', orderRoutes);

// Import test setup
require('./setup');

describe('Orders API', () => {
  let retailerId;
  let customerId;
  let productId;
  let customerToken;
  let retailerToken;
  let orderId;

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
    
    // Generate retailer token
    retailerToken = jwt.sign(
      { id: retailerId, role: 'retailer' },
      process.env.JWT_SECRET || 'secretKey',
      { expiresIn: '1d' }
    );

    // Create a customer user
    const customer = new User({
      name: 'Test Customer',
      phone: '9876543210',
      email: 'customer@example.com',
      password: 'password123',
      role: 'customer'
    });
    await customer.save();
    customerId = customer._id;
    
    // Generate customer token
    customerToken = jwt.sign(
      { id: customerId, role: 'customer' },
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

    // Create a test order
    const order = new Order({
      customer: customerId,
      orderItems: [
        {
          product: productId,
          name: 'Test Product',
          quantity: 2,
          price: 19.99,
          discountPercentage: 0
        }
      ],
      shippingAddress: {
        street: '123 Test St',
        city: 'Test City',
        state: 'TS',
        zipCode: '12345',
        country: 'Testland'
      },
      paymentMethod: 'Cash on Delivery'
    });
    await order.save();
    orderId = order._id;
  });

  describe('POST /api/orders', () => {
    it('should create a new order for customer', async () => {
      // Set req.user for this test
      protect.mockImplementationOnce((req, res, next) => {
        req.user = { id: customerId.toString(), role: 'customer' };
        next();
      });
      
      const newOrder = {
        orderItems: [
          {
            product: productId,
            quantity: 3
          }
        ],
        shippingAddress: {
          street: '456 Order St',
          city: 'Order City',
          state: 'OS',
          zipCode: '54321',
          country: 'Orderland'
        },
        paymentMethod: 'Cash on Delivery'
      };

      const response = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send(newOrder);

      expect(response.status).toBe(201);
      expect(response.body.success).toBeTruthy();
      expect(response.body.data.customer.toString()).toBe(customerId.toString());
      expect(response.body.data.orderItems.length).toBe(1);
      expect(response.body.data.orderItems[0].quantity).toBe(3);

      // Check if product quantity was reduced
      const updatedProduct = await Product.findById(productId);
      expect(updatedProduct.quantity).toBe(7); // 10 - 3 = 7
    });

    it('should not create order with insufficient quantity', async () => {
      // Set req.user for this test
      protect.mockImplementationOnce((req, res, next) => {
        req.user = { id: customerId.toString(), role: 'customer' };
        next();
      });
      
      const newOrder = {
        orderItems: [
          {
            product: productId,
            quantity: 20 // More than available
          }
        ],
        shippingAddress: {
          street: '456 Order St',
          city: 'Order City',
          state: 'OS',
          zipCode: '54321',
          country: 'Orderland'
        },
        paymentMethod: 'Cash on Delivery'
      };

      const response = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${customerToken}`)
        .send(newOrder);

      expect(response.status).toBe(400);
      expect(response.body.success).toBeFalsy();
      expect(response.body.message).toContain('Not enough stock');
    });
  });

  describe('GET /api/orders/me', () => {
    it('should get customer orders', async () => {
      // Set req.user for this test
      protect.mockImplementationOnce((req, res, next) => {
        req.user = { id: customerId.toString(), role: 'customer' };
        next();
      });

      const response = await request(app)
        .get('/api/orders/me')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBeTruthy();
      expect(response.body.count).toBe(1);
      expect(response.body.data[0].customer.toString()).toBe(customerId.toString());
    });
  });

  describe('GET /api/orders/:id', () => {
    it('should get a single order by ID for customer', async () => {
      // Set req.user for this test
      protect.mockImplementationOnce((req, res, next) => {
        req.user = { id: customerId.toString(), role: 'customer' };
        next();
      });

      const response = await request(app)
        .get(`/api/orders/${orderId}`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBeTruthy();
      expect(response.body.data._id.toString()).toBe(orderId.toString());
    });

    it('should get a single order by ID for retailer with products in the order', async () => {
      // Set req.user for this test
      protect.mockImplementationOnce((req, res, next) => {
        req.user = { id: retailerId.toString(), role: 'retailer' };
        next();
      });

      const response = await request(app)
        .get(`/api/orders/${orderId}`)
        .set('Authorization', `Bearer ${retailerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBeTruthy();
      expect(response.body.data._id.toString()).toBe(orderId.toString());
    });
  });

  describe('PATCH /api/orders/:id/status', () => {
    it('should update order status by retailer', async () => {
      // Set req.user for this test
      protect.mockImplementationOnce((req, res, next) => {
        req.user = { id: retailerId.toString(), role: 'retailer' };
        next();
      });

      const response = await request(app)
        .patch(`/api/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${retailerToken}`)
        .send({ status: 'shipped' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBeTruthy();
      expect(response.body.data.status).toBe('shipped');
    });

    it('should not allow invalid status updates', async () => {
      // Set req.user for this test
      protect.mockImplementationOnce((req, res, next) => {
        req.user = { id: retailerId.toString(), role: 'retailer' };
        next();
      });

      const response = await request(app)
        .patch(`/api/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${retailerToken}`)
        .send({ status: 'invalid_status' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBeFalsy();
      expect(response.body.message).toBe('Invalid status');
    });
  });
}); 