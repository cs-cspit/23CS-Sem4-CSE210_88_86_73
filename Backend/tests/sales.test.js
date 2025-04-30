const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Product = require('../models/Product');
const { app, protect, authorize } = require('./testApp');

// Import test setup
require('./setup');

describe('Sales and Discounting API', () => {
  let retailerId;
  let retailerToken;
  let customerId;
  let customerToken;
  let productIds = [];

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

    // Create test products
    const products = [
      {
        name: 'Fresh Product',
        description: 'A product that is not near expiry',
        category: 'Dairy',
        price: 29.99,
        quantity: 10,
        expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        retailer: retailerId
      },
      {
        name: 'Near Expiry Product',
        description: 'A product that is near expiry',
        category: 'Bakery',
        price: 9.99,
        quantity: 5,
        expiryDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
        retailer: retailerId
      },
      {
        name: 'Discounted Product',
        description: 'A product that is already discounted',
        category: 'Produce',
        price: 19.99,
        quantity: 8,
        expiryDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days from now
        retailer: retailerId,
        discountPercentage: 20,
        isDiscounted: true
      }
    ];

    productIds = [];
    for (const product of products) {
      const savedProduct = await new Product(product).save();
      productIds.push(savedProduct._id);
    }
  });

  describe('GET /api/products/sale/discounted', () => {
    it('should return only discounted products', async () => {
      const response = await request(app)
        .get('/api/products/sale/discounted');

      expect(response.status).toBe(200);
      expect(response.body.success).toBeTruthy();
      expect(response.body.count).toBe(1);
      expect(response.body.data[0].name).toBe('Discounted Product');
      expect(response.body.data[0].isDiscounted).toBe(true);
      expect(response.body.data[0].discountPercentage).toBe(20);
    });
  });

  describe('GET /api/products/expiring-soon', () => {
    it('should return products expiring within 7 days', async () => {
      const response = await request(app)
        .get('/api/products/expiring-soon');

      expect(response.status).toBe(200);
      expect(response.body.success).toBeTruthy();
      expect(response.body.data.length).toBeGreaterThanOrEqual(2);
      
      // Check that all returned products expire within the next 7 days
      const allExpiringSoon = response.body.data.every(product => {
        const expiryDate = new Date(product.expiryDate);
        const today = new Date();
        const diffTime = Math.abs(expiryDate - today);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays <= 7;
      });
      expect(allExpiringSoon).toBe(true);
    });
  });

  describe('PATCH /api/products/:id/discount', () => {
    it('should apply discount to a product', async () => {
      // Print product ID for debugging
      const productId = productIds[0].toString();
      console.log('Using product ID for discount test:', productId);
      
      // Direct database lookup to confirm product exists
      const dbProduct = await Product.findById(productId);
      console.log('Product found in DB directly:', !!dbProduct, dbProduct ? dbProduct.name : 'null');
      
      // Set req.user for this test
      protect.mockImplementationOnce((req, res, next) => {
        req.user = { id: retailerId.toString(), role: 'retailer' };
        next();
      });

      const response = await request(app)
        .patch(`/api/products/${productId}/discount`)
        .set('Authorization', `Bearer ${retailerToken}`)
        .send({ discountPercentage: 15 });

      console.log('Discount test response:', response.status, response.body);
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBeTruthy();
      expect(response.body.data.discountPercentage).toBe(15);
      expect(response.body.data.isDiscounted).toBe(true);
    });

    it('should not allow discount above 100%', async () => {
      // Set req.user for this test
      protect.mockImplementationOnce((req, res, next) => {
        req.user = { id: retailerId.toString(), role: 'retailer' };
        next();
      });

      const response = await request(app)
        .patch(`/api/products/${productIds[0]}/discount`)
        .set('Authorization', `Bearer ${retailerToken}`)
        .send({ discountPercentage: 120 });

      expect(response.status).toBe(400);
      expect(response.body.success).toBeFalsy();
    });

    it('should not allow customers to apply discounts', async () => {
      // Set req.user for this test
      protect.mockImplementationOnce((req, res, next) => {
        req.user = { id: customerId.toString(), role: 'customer' };
        next();
      });

      const response = await request(app)
        .patch(`/api/products/${productIds[0]}/discount`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ discountPercentage: 15 });

      expect(response.status).toBe(403);
      expect(response.body.success).toBeFalsy();
    });
  });

  describe('PATCH /api/products/:id/remove-discount', () => {
    it('should remove discount from a product', async () => {
      // Set req.user for this test
      protect.mockImplementationOnce((req, res, next) => {
        req.user = { id: retailerId.toString(), role: 'retailer' };
        next();
      });

      const response = await request(app)
        .patch(`/api/products/${productIds[2]}/remove-discount`)
        .set('Authorization', `Bearer ${retailerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBeTruthy();
      expect(response.body.data.discountPercentage).toBe(0);
      expect(response.body.data.isDiscounted).toBe(false);
    });
  });

  describe('PATCH /api/products/auto-discount', () => {
    it('should apply automatic discounts to near expiry products', async () => {
      // Set req.user for this test
      protect.mockImplementationOnce((req, res, next) => {
        req.user = { id: retailerId.toString(), role: 'retailer' };
        next();
      });

      const response = await request(app)
        .patch('/api/products/auto-discount')
        .set('Authorization', `Bearer ${retailerToken}`)
        .send({
          expiryDays: 5,
          discountPercentage: 25
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBeTruthy();
      expect(response.body.count).toBeGreaterThanOrEqual(1);
      
      // Check that all near expiry products were discounted
      const product = await Product.findById(productIds[1]);
      expect(product.isDiscounted).toBe(true);
      expect(product.discountPercentage).toBe(25);
    });
  });
}); 