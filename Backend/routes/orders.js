const express = require('express');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// Create new order (customers only)
router.post('/', protect, authorize('customer'), async (req, res) => {
    try {
        const { orderItems, shippingAddress, paymentMethod } = req.body;

        if (!orderItems || orderItems.length === 0) {
            return res.status(400).json({ success: false, message: 'No order items' });
        }

        // Check if all products exist and have sufficient quantity
        for (const item of orderItems) {
            const product = await Product.findById(item.product);
            
            if (!product) {
                return res.status(404).json({ 
                    success: false, 
                    message: `Product not found with ID: ${item.product}` 
                });
            }
            
            if (product.quantity < item.quantity) {
                return res.status(400).json({ 
                    success: false, 
                    message: `Not enough stock for ${product.name}. Available: ${product.quantity}` 
                });
            }
            
            // Add product details to order item
            item.name = product.name;
            item.price = product.price;
            item.discountPercentage = product.discountPercentage;
        }

        // Create order
        const order = await Order.create({
            customer: req.user.id,
            orderItems,
            shippingAddress,
            paymentMethod
        });

        // Reduce product quantities
        for (const item of orderItems) {
            await Product.findByIdAndUpdate(
                item.product,
                { $inc: { quantity: -item.quantity } }
            );
        }

        res.status(201).json({
            success: true,
            data: order
        });
    } catch (err) {
        console.error('Create order error:', err);
        
        if (err.name === 'ValidationError') {
            const messages = Object.values(err.errors).map(val => val.message);
            return res.status(400).json({ success: false, message: messages.join(', ') });
        }
        
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
});

// Get all orders for logged in customer
router.get('/me', protect, authorize('customer'), async (req, res) => {
    try {
        const orders = await Order.find({ customer: req.user.id })
                                   .sort({ createdAt: -1 });
        
        res.status(200).json({
            success: true,
            count: orders.length,
            data: orders
        });
    } catch (err) {
        console.error('Get orders error:', err);
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
});

// Get single order by ID
router.get('/:id', protect, async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }
        
        // Make sure customer owns the order or retailer has products in order
        const isCustomer = req.user.role === 'customer' && order.customer.toString() === req.user.id;
        let isRetailer = false;
        
        if (req.user.role === 'retailer') {
            // Find if retailer has any products in the order
            const retailerProducts = await Product.find({ retailer: req.user.id });
            const retailerProductIds = retailerProducts.map(p => p._id.toString());
            
            isRetailer = order.orderItems.some(item => 
                retailerProductIds.includes(item.product.toString())
            );
        }
        
        if (!isCustomer && !isRetailer) {
            return res.status(403).json({ success: false, message: 'Not authorized to access this order' });
        }
        
        res.status(200).json({
            success: true,
            data: order
        });
    } catch (err) {
        console.error('Get order error:', err);
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
});

// Get orders containing retailer's products (retailers only)
router.get('/retailer/myproducts', protect, authorize('retailer'), async (req, res) => {
    try {
        // Find retailer's products
        const retailerProducts = await Product.find({ retailer: req.user.id });
        const retailerProductIds = retailerProducts.map(p => p._id.toString());
        
        // Find orders containing retailer's products
        const orders = await Order.find({
            'orderItems.product': { $in: retailerProductIds.map(id => new mongoose.Types.ObjectId(id)) }
        }).sort({ createdAt: -1 });
        
        res.status(200).json({
            success: true,
            count: orders.length,
            data: orders
        });
    } catch (err) {
        console.error('Get retailer orders error:', err);
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
});

// Update order status (retailers only)
router.patch('/:id/status', protect, authorize('retailer'), async (req, res) => {
    try {
        const { status } = req.body;
        
        if (!status) {
            return res.status(400).json({ success: false, message: 'Status is required' });
        }
        
        const validStatuses = ['processing', 'shipped', 'delivered', 'cancelled'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }
        
        const order = await Order.findById(req.params.id);
        
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }
        
        // Check if retailer has products in this order
        const retailerProducts = await Product.find({ retailer: req.user.id });
        const retailerProductIds = retailerProducts.map(p => p._id.toString());
        
        const hasRetailerProducts = order.orderItems.some(item => 
            retailerProductIds.includes(item.product.toString())
        );
        
        if (!hasRetailerProducts) {
            return res.status(403).json({ success: false, message: 'Not authorized to update this order' });
        }
        
        const updatedOrder = await Order.findByIdAndUpdate(
            req.params.id,
            { status },
            { new: true }
        );
        
        res.status(200).json({
            success: true,
            data: updatedOrder
        });
    } catch (err) {
        console.error('Update order status error:', err);
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
});

module.exports = router; 