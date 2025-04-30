const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Product = require('../models/Product');
const { app, protect, authorize } = require('./testApp');

// Import test setup
require('./setup');

describe('Surplus Management API', () => {
  let retailerId;
  let retailerToken;
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

    // Create test products
    const today = new Date();
    const productData = [
      {
        name: 'Fresh Product',
        description: 'A product that is not near expiry',
        category: 'Dairy',
        price: 29.99,
        quantity: 10,
        expiryDate: new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        retailer: retailerId
      },
      {
        name: 'Near Expiry Product',
        description: 'A product that is near expiry',
        category: 'Bakery',
        price: 9.99,
        quantity: 5,
        expiryDate: new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
        status: 'near_expiry',
        retailer: retailerId
      },
      {
        name: 'Expired Product',
        description: 'A product that has expired',
        category: 'Produce',
        price: 19.99,
        quantity: 2,
        expiryDate: new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
        status: 'expired',
        retailer: retailerId
      },
      {
        name: 'Discounted Product',
        description: 'A product that is already discounted',
        category: 'Meat',
        price: 49.99,
        quantity: 3,
        expiryDate: new Date(today.getTime() + 5 * 24 * 60 * 60 * 1000), // 5 days from now
        status: 'near_expiry',
        discountPercentage: 20,
        isDiscounted: true,
        retailer: retailerId
      }
    ];

    productIds = [];
    for (const data of productData) {
      const product = await new Product(data).save();
      productIds.push(product._id);
    }
    
    console.log('Created product IDs for surplus test:', productIds.map(id => id.toString()));
  });

  describe('GET /api/surplus/dashboard', () => {
    it('should return surplus dashboard data for retailer', async () => {
      // Set req.user for this test
      protect.mockImplementationOnce((req, res, next) => {
        req.user = { id: retailerId.toString(), role: 'retailer' };
        next();
      });

      const response = await request(app)
        .get('/api/surplus/dashboard')
        .set('Authorization', `Bearer ${retailerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBeTruthy();
      expect(response.body.data).toHaveProperty('nearExpiryCount');
      expect(response.body.data).toHaveProperty('expiredCount');
      expect(response.body.data).toHaveProperty('discountedCount');
      expect(response.body.data).toHaveProperty('expiringToday');
      expect(response.body.data).toHaveProperty('expiringThisWeek');
      expect(response.body.data).toHaveProperty('potentialLoss');
      expect(response.body.data).toHaveProperty('savedValue');
      
      // Verify counts match our test data
      expect(response.body.data.nearExpiryCount).toBe(2); // Two near_expiry products
      expect(response.body.data.expiredCount).toBe(1); // One expired product
      expect(response.body.data.discountedCount).toBe(1); // One discounted product
    });
  });

  describe('GET /api/surplus/needs-attention', () => {
    it('should return near expiry products that are not discounted', async () => {
      // Set req.user for this test
      protect.mockImplementationOnce((req, res, next) => {
        req.user = { id: retailerId.toString(), role: 'retailer' };
        next();
      });

      const response = await request(app)
        .get('/api/surplus/needs-attention')
        .set('Authorization', `Bearer ${retailerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBeTruthy();
      expect(response.body.count).toBe(1); // Only one near_expiry product that is not discounted
      expect(response.body.data[0].name).toBe('Near Expiry Product');
      expect(response.body.data[0].status).toBe('near_expiry');
      expect(response.body.data[0].isDiscounted).toBeFalsy();
    });
  });

  describe('PATCH /api/surplus/auto-discount', () => {
    it('should apply automatic discounts to near expiry products', async () => {
      // Set req.user for this test
      protect.mockImplementationOnce((req, res, next) => {
        req.user = { id: retailerId.toString(), role: 'retailer' };
        next();
      });

      // Check product status before test
      const nearExpiryProductId = productIds[1].toString(); 
      const beforeTest = await Product.findById(nearExpiryProductId);
      console.log('Near Expiry Product before test:', !!beforeTest, 
        beforeTest ? {
          id: beforeTest._id.toString(),
          name: beforeTest.name,
          status: beforeTest.status,
          isDiscounted: beforeTest.isDiscounted
        } : 'null');

      const response = await request(app)
        .patch('/api/surplus/auto-discount')
        .set('Authorization', `Bearer ${retailerToken}`)
        .send({
          expiryDays: 5,
          discountPercentage: 25
        });

      console.log('Auto discount response:', response.status, response.body);
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBeTruthy();
      expect(response.body.count).toBe(1); // Only one non-discounted product within 5 days of expiry
      
      // Verify product was discounted
      const updatedProduct = await Product.findById(productIds[1]); // Near Expiry Product
      console.log('Near Expiry Product after test:', !!updatedProduct,
        updatedProduct ? {
          id: updatedProduct._id.toString(),
          name: updatedProduct.name,
          status: updatedProduct.status,
          isDiscounted: updatedProduct.isDiscounted,
          discountPercentage: updatedProduct.discountPercentage
        } : 'null');
        
      expect(updatedProduct.discountPercentage).toBe(25);
      expect(updatedProduct.isDiscounted).toBeTruthy();
    });

    it('should not discount fresh products', async () => {
      // Set req.user for this test
      protect.mockImplementationOnce((req, res, next) => {
        req.user = { id: retailerId.toString(), role: 'retailer' };
        next();
      });

      const response = await request(app)
        .patch('/api/surplus/auto-discount')
        .set('Authorization', `Bearer ${retailerToken}`)
        .send({
          expiryDays: 3, // Only discount products expiring within 3 days
          discountPercentage: 25
        });

      // Only the 'Near Expiry Product' should be discounted (expiring in 3 days)
      expect(response.status).toBe(200);
      expect(response.body.success).toBeTruthy();
      expect(response.body.count).toBe(1);
      
      // Verify fresh product was not discounted
      const freshProduct = await Product.findById(productIds[0]);
      expect(freshProduct.isDiscounted).toBeFalsy();
      expect(freshProduct.discountPercentage).toBe(0);
    });
  });

  describe('GET /api/surplus/recommendations', () => {
    it('should return discount recommendations based on expiry date', async () => {
      // Set req.user for this test
      protect.mockImplementationOnce((req, res, next) => {
        req.user = { id: retailerId.toString(), role: 'retailer' };
        next();
      });

      const response = await request(app)
        .get('/api/surplus/recommendations')
        .set('Authorization', `Bearer ${retailerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBeTruthy();
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBeGreaterThanOrEqual(1);
      
      // Check structure of recommendations
      const recommendation = response.body.data[0];
      expect(recommendation).toHaveProperty('product');
      expect(recommendation).toHaveProperty('daysUntilExpiry');
      expect(recommendation).toHaveProperty('recommendedDiscount');
      expect(recommendation).toHaveProperty('reason');
    });
  });

  describe('POST /api/surplus/apply-recommendations', () => {
    it('should apply recommended discounts in bulk', async () => {
      // Set req.user for this test
      protect.mockImplementationOnce((req, res, next) => {
        req.user = { id: retailerId.toString(), role: 'retailer' };
        next();
      });

      const freshProductId = productIds[0].toString();
      const nearExpiryProductId = productIds[1].toString();
      
      console.log('Applying discounts to products:', freshProductId, nearExpiryProductId);
      
      // Check products before test
      const prod1 = await Product.findById(freshProductId);
      const prod2 = await Product.findById(nearExpiryProductId);
      console.log('Products exist in DB:', !!prod1, !!prod2);

      const recommendations = [
        { productId: freshProductId, discountPercentage: 10 },
        { productId: nearExpiryProductId, discountPercentage: 50 }
      ];

      const response = await request(app)
        .post('/api/surplus/apply-recommendations')
        .set('Authorization', `Bearer ${retailerToken}`)
        .send({ recommendations });
        
      console.log('Apply recommendations response:', response.status, response.body);

      expect(response.status).toBe(200);
      expect(response.body.success).toBeTruthy();
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBe(2);
      expect(response.body.data[0].success).toBeTruthy();
      expect(response.body.data[1].success).toBeTruthy();
      
      // Verify products were discounted
      const product1 = await Product.findById(productIds[0]);
      const product2 = await Product.findById(productIds[1]);
      console.log('Products after update:', 
        !!product1 ? { name: product1.name, discounted: product1.isDiscounted } : 'null',
        !!product2 ? { name: product2.name, discounted: product2.isDiscounted } : 'null');
        
      expect(product1.discountPercentage).toBe(10);
      expect(product1.isDiscounted).toBeTruthy();
      expect(product2.discountPercentage).toBe(50);
      expect(product2.isDiscounted).toBeTruthy();
    });

    it('should report errors for invalid product IDs', async () => {
      // Set req.user for this test
      protect.mockImplementationOnce((req, res, next) => {
        req.user = { id: retailerId.toString(), role: 'retailer' };
        next();
      });

      const fakeId = new mongoose.Types.ObjectId();
      const recommendations = [
        { productId: productIds[0].toString(), discountPercentage: 10 },
        { productId: fakeId.toString(), discountPercentage: 20 }
      ];

      const response = await request(app)
        .post('/api/surplus/apply-recommendations')
        .set('Authorization', `Bearer ${retailerToken}`)
        .send({ recommendations });

      expect(response.status).toBe(200);
      expect(response.body.success).toBeTruthy();
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBe(2);
      expect(response.body.data[0].success).toBeTruthy();
      expect(response.body.data[1].success).toBeFalsy();
      expect(response.body.data[1].message).toBe('Product not found');
    });
  });

  describe('GET /api/surplus/reports', () => {
    it('should return surplus reports with summary statistics', async () => {
      // Set req.user for this test
      protect.mockImplementationOnce((req, res, next) => {
        req.user = { id: retailerId.toString(), role: 'retailer' };
        next();
      });

      const response = await request(app)
        .get('/api/surplus/reports')
        .set('Authorization', `Bearer ${retailerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBeTruthy();
      expect(response.body.data).toHaveProperty('summary');
      expect(response.body.data).toHaveProperty('expiredProducts');
      expect(response.body.data).toHaveProperty('nearExpiryProducts');
      expect(response.body.data).toHaveProperty('discountedProducts');
      
      // Verify summary data
      expect(response.body.data.summary.totalProducts).toBe(4);
      expect(response.body.data.summary.expiredCount).toBe(1);
      expect(response.body.data.summary.nearExpiryCount).toBe(2);
      expect(response.body.data.summary.discountedCount).toBe(1);
    });
  });
}); 