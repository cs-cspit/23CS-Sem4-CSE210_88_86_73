// routes/auth.js

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const router = express.Router();

// Signup route
router.post('/signup', async (req, res) => {
    try {
        const { name, phone, email, password, confirmPassword, role, address } = req.body;

        // Check if passwords match
        if (password !== confirmPassword) {
            return res.status(400).json({ success: false, message: "Passwords do not match" });
        }

        // Check if the user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ success: false, message: "User already exists" });
        }

        // Validate role
        const validRoles = ['retailer', 'customer'];
        if (role && !validRoles.includes(role)) {
            return res.status(400).json({ success: false, message: "Invalid role" });
        }

        // Create a new user
        const newUser = new User({
            name,
            phone,
            email,
            password,
            role: role || 'customer',
            address
        });

        await newUser.save();

        // Generate token
        const token = newUser.generateAuthToken();

        res.status(201).json({
            success: true,
            message: "User registered successfully",
            data: {
                user: {
                    id: newUser._id,
                    name: newUser.name,
                    email: newUser.email,
                    role: newUser.role
                },
                token
            }
        });
    } catch (err) {
        console.error('Signup error:', err);
        res.status(500).json({ success: false, message: "Error registering user", error: err.message });
    }
});

// Login route
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Check if the user exists
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ success: false, message: "Invalid email or password" });
        }

        // Check if the password is correct
        const isMatch = await user.matchPassword(password);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: "Invalid email or password" });
        }

        // Generate JWT token
        const token = user.generateAuthToken();

        res.status(200).json({
            success: true,
            message: "Login successful",
            data: {
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role
                },
                token
            }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ success: false, message: "Server error", error: err.message });
    }
});

// Get current user profile
router.get('/me', async (req, res) => {
    try {
        // Extract token from header
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ success: false, message: 'No token, authorization denied' });
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secretKey');
        
        // Find user
        const user = await User.findById(decoded.id).select('-password');
        
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        res.status(200).json({
            success: true,
            data: {
                user
            }
        });
    } catch (err) {
        console.error('Get profile error:', err);
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
});

module.exports = router;
