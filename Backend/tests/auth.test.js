const request = require('supertest');
const mongoose = require('mongoose');
const express = require('express');
const bodyParser = require('body-parser');
const User = require('../models/User');
const authRoutes = require('../routes/auth');

// Setup test app
const app = express();
app.use(bodyParser.json());
app.use('/api/auth', authRoutes);

// Import test setup
require('./setup');

describe('Authentication API', () => {
  describe('POST /api/auth/signup', () => {
    it('should create a new user with valid data', async () => {
      const userData = {
        name: 'Test User',
        phone: '1234567890',
        email: 'test@example.com',
        password: 'password123',
        confirmPassword: 'password123',
        role: 'customer'
      };

      const response = await request(app)
        .post('/api/auth/signup')
        .send(userData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBeTruthy();
      expect(response.body.message).toBe('User registered successfully');
      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data).toHaveProperty('token');
      expect(response.body.data.user.email).toBe(userData.email);
      expect(response.body.data.user.role).toBe(userData.role);
    });

    it('should not allow duplicate emails', async () => {
      // Create a user first
      const userData = {
        name: 'Test User',
        phone: '1234567890',
        email: 'duplicate@example.com',
        password: 'password123',
        confirmPassword: 'password123'
      };

      await request(app)
        .post('/api/auth/signup')
        .send(userData);

      // Try to create another user with the same email
      const response = await request(app)
        .post('/api/auth/signup')
        .send(userData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBeFalsy();
      expect(response.body.message).toBe('User already exists');
    });

    it('should validate password matching', async () => {
      const userData = {
        name: 'Test User',
        phone: '1234567890',
        email: 'test2@example.com',
        password: 'password123',
        confirmPassword: 'different_password'
      };

      const response = await request(app)
        .post('/api/auth/signup')
        .send(userData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBeFalsy();
      expect(response.body.message).toBe('Passwords do not match');
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      // Create a test user for login tests
      const userData = {
        name: 'Login Test User',
        phone: '1234567890',
        email: 'login@example.com',
        password: 'password123'
      };

      const user = new User(userData);
      await user.save();
    });

    it('should login a user with valid credentials', async () => {
      const loginData = {
        email: 'login@example.com',
        password: 'password123'
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBeTruthy();
      expect(response.body.message).toBe('Login successful');
      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data).toHaveProperty('token');
      expect(response.body.data.user.email).toBe(loginData.email);
    });

    it('should not login with incorrect password', async () => {
      const loginData = {
        email: 'login@example.com',
        password: 'wrongpassword'
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBeFalsy();
      expect(response.body.message).toBe('Invalid email or password');
    });

    it('should not login with non-existent email', async () => {
      const loginData = {
        email: 'nonexistent@example.com',
        password: 'password123'
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBeFalsy();
      expect(response.body.message).toBe('Invalid email or password');
    });
  });
}); 