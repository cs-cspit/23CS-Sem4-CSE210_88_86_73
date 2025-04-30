const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Product = require('../models/Product');
const { app, protect, authorize } = require('./testApp');

// Import test setup
require('./setup');

describe('Inventory Management API', () => {
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
    const productData = [
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
        name: 'Low Stock Product',
        description: 'A product with low stock',
        category: 'Bakery',
        price: 9.99,
        quantity: 3,
        expiryDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000), // 20 days from now
        retailer: retailerId
      },
      {
        name: 'Out of Stock Product',
        description: 'A product that is out of stock',
        category: 'Produce',
        price: 19.99,
        quantity: 0,
        expiryDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // 15 days from now
        retailer: retailerId
      }
    ];

    productIds = [];
    for (const data of productData) {
      const product = await new Product(data).save();
      productIds.push(product._id);
    }
    
    console.log('Created product IDs for inventory test:', productIds.map(id => id.toString()));
  });

  describe('GET /api/inventory/dashboard', () => {
    it('should return inventory dashboard data for retailer', async () => {
      // Set req.user for this test
      protect.mockImplementationOnce((req, res, next) => {
        req.user = { id: retailerId.toString(), role: 'retailer' };
        next();
      });

      const response = await request(app)
        .get('/api/inventory/dashboard')
        .set('Authorization', `Bearer ${retailerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBeTruthy();
      expect(response.body.data).toHaveProperty('totalProducts');
      expect(response.body.data).toHaveProperty('categoryCounts');
      expect(response.body.data).toHaveProperty('inventoryValue');
      expect(response.body.data).toHaveProperty('lowStockCount');
      expect(response.body.data).toHaveProperty('outOfStockCount');
      
      // Verify counts match our test data
      expect(response.body.data.totalProducts).toBe(3);
      expect(response.body.data.lowStockCount).toBe(1);
      expect(response.body.data.outOfStockCount).toBe(1);
    });
  });

  describe('GET /api/inventory/reports', () => {
    it('should return inventory reports with filter options', async () => {
      // Set req.user for this test
      protect.mockImplementationOnce((req, res, next) => {
        req.user = { id: retailerId.toString(), role: 'retailer' };
        next();
      });

      const response = await request(app)
        .get('/api/inventory/reports')
        .set('Authorization', `Bearer ${retailerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBeTruthy();
      expect(response.body.data).toHaveProperty('summary');
      expect(response.body.data).toHaveProperty('products');
      expect(response.body.data.products.length).toBe(3);
      expect(response.body.data.summary).toHaveProperty('totalProducts');
      expect(response.body.data.summary).toHaveProperty('totalValue');
      expect(response.body.data.summary).toHaveProperty('totalQuantity');
    });

    it('should filter reports by category', async () => {
      // Set req.user for this test
      protect.mockImplementationOnce((req, res, next) => {
        req.user = { id: retailerId.toString(), role: 'retailer' };
        next();
      });

      const response = await request(app)
        .get('/api/inventory/reports?category=Dairy')
        .set('Authorization', `Bearer ${retailerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBeTruthy();
      expect(response.body.data.products.length).toBe(1);
      expect(response.body.data.products[0].category).toBe('Dairy');
    });
  });

  describe('GET /api/inventory/expiry-timeline', () => {
    it('should return products grouped by expiry timeline', async () => {
      // Set req.user for this test
      protect.mockImplementationOnce((req, res, next) => {
        req.user = { id: retailerId.toString(), role: 'retailer' };
        next();
      });

      const response = await request(app)
        .get('/api/inventory/expiry-timeline')
        .set('Authorization', `Bearer ${retailerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBeTruthy();
      expect(response.body.data).toHaveProperty('expiringThisWeek');
      expect(response.body.data).toHaveProperty('expiringThisMonth');
      expect(response.body.data).toHaveProperty('expired');
    });
  });

  describe('GET /api/inventory/stock-alerts', () => {
    it('should return stock level alerts', async () => {
      // Set req.user for this test
      protect.mockImplementationOnce((req, res, next) => {
        req.user = { id: retailerId.toString(), role: 'retailer' };
        next();
      });

      const response = await request(app)
        .get('/api/inventory/stock-alerts')
        .set('Authorization', `Bearer ${retailerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBeTruthy();
      expect(response.body.data).toHaveProperty('lowStock');
      expect(response.body.data).toHaveProperty('outOfStock');
      expect(response.body.data).toHaveProperty('overStocked');
      
      // Verify our test data is reflected in the alerts
      expect(response.body.data.lowStock.length).toBe(1);
      expect(response.body.data.lowStock[0].name).toBe('Low Stock Product');
      expect(response.body.data.outOfStock.length).toBe(1);
      expect(response.body.data.outOfStock[0].name).toBe('Out of Stock Product');
    });
  });

  describe('PATCH /api/inventory/bulk-update', () => {
    it('should update quantities for multiple products', async () => {
      // Set req.user for this test
      protect.mockImplementationOnce((req, res, next) => {
        req.user = { id: retailerId.toString(), role: 'retailer' };
        next();
      });

      const productId1 = productIds[0].toString();
      const productId2 = productIds[1].toString();
      
      console.log('Updating products with IDs:', productId1, productId2);
      
      // Verify products exist first
      const prod1 = await Product.findById(productId1);
      const prod2 = await Product.findById(productId2);
      console.log('Products exist in DB:', !!prod1, !!prod2);

      const updates = [
        { productId: productId1, quantity: 20 },
        { productId: productId2, quantity: 15 }
      ];

      const response = await request(app)
        .patch('/api/inventory/bulk-update')
        .set('Authorization', `Bearer ${retailerToken}`)
        .send({ updates });

      console.log('Bulk update response:', response.status, response.body);

      expect(response.status).toBe(200);
      expect(response.body.success).toBeTruthy();
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBe(2);
      expect(response.body.data[0].success).toBeTruthy();
      expect(response.body.data[1].success).toBeTruthy();
      
      // Verify product quantities were updated
      const product1 = await Product.findById(productIds[0]);
      const product2 = await Product.findById(productIds[1]);
      expect(product1.quantity).toBe(20);
      expect(product2.quantity).toBe(15);
    });

    it('should report errors for invalid product IDs', async () => {
      // Set req.user for this test
      protect.mockImplementationOnce((req, res, next) => {
        req.user = { id: retailerId.toString(), role: 'retailer' };
        next();
      });

      const fakeId = new mongoose.Types.ObjectId();
      const updates = [
        { productId: productIds[0].toString(), quantity: 20 },
        { productId: fakeId.toString(), quantity: 15 }
      ];

      const response = await request(app)
        .patch('/api/inventory/bulk-update')
        .set('Authorization', `Bearer ${retailerToken}`)
        .send({ updates });

      expect(response.status).toBe(200);
      expect(response.body.success).toBeTruthy();
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBe(2);
      expect(response.body.data[0].success).toBeTruthy();
      expect(response.body.data[1].success).toBeFalsy();
      expect(response.body.data[1].message).toBe('Product not found');
    });
  });
}); 