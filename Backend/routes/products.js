const express = require('express');
const Product = require('../models/Product');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

/**
 * PATH-SPECIFIC ROUTES - Must come BEFORE parameter routes
 */

// Get all products (public)
router.get('/', async (req, res) => {
    try {
        const products = await Product.find({ quantity: { $gt: 0 } })
                                       .sort({ createdAt: -1 });
        
        res.status(200).json({
            success: true,
            count: products.length,
            data: products
        });
    } catch (err) {
        console.error('Get products error:', err);
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
});

// Get retailer inventory (retailers only)
router.get('/inventory/me', protect, authorize('retailer'), async (req, res) => {
    try {
        const products = await Product.find({ retailer: req.user.id })
                                       .sort({ createdAt: -1 });
        
        res.status(200).json({
            success: true,
            count: products.length,
            data: products
        });
    } catch (err) {
        console.error('Get inventory error:', err);
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
});

// Get near expiry products (retailers only)
router.get('/surplus/near-expiry', protect, authorize('retailer'), async (req, res) => {
    try {
        const products = await Product.find({ 
            retailer: req.user.id,
            status: 'near_expiry'
        }).sort({ expiryDate: 1 });
        
        res.status(200).json({
            success: true,
            count: products.length,
            data: products
        });
    } catch (err) {
        console.error('Get surplus error:', err);
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
});

// Get expiring soon products (public)
router.get('/expiring-soon', async (req, res) => {
    try {
        const today = new Date();
        const oneWeekLater = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
        
        const products = await Product.find({
            expiryDate: { $gte: today, $lte: oneWeekLater },
            quantity: { $gt: 0 }
        }).sort({ expiryDate: 1 });
        
        res.status(200).json({
            success: true,
            count: products.length,
            data: products
        });
    } catch (err) {
        console.error('Get expiring soon error:', err);
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
});

// Get discounted products for sale (public)
router.get('/sale/discounted', async (req, res) => {
    try {
        const products = await Product.find({ 
            isDiscounted: true,
            quantity: { $gt: 0 }
        }).sort({ discountPercentage: -1 });
        
        res.status(200).json({
            success: true,
            count: products.length,
            data: products
        });
    } catch (err) {
        console.error('Get discounted products error:', err);
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
});

// Auto-apply discounts to products based on expiry date (retailers only)
router.patch('/auto-discount', protect, authorize('retailer'), async (req, res) => {
    try {
        const { expiryDays, discountPercentage } = req.body;
        
        if (!expiryDays || !discountPercentage) {
            return res.status(400).json({
                success: false,
                message: 'Expiry days and discount percentage are required'
            });
        }
        
        // Find products expiring within the specified days
        const today = new Date();
        const targetDate = new Date(today.getTime() + (expiryDays * 24 * 60 * 60 * 1000));
        
        const productsToUpdate = await Product.find({
            retailer: req.user.id,
            expiryDate: { $lte: targetDate },
            quantity: { $gt: 0 },
            isDiscounted: false // Only apply to non-discounted products
        });
        
        // Apply discount to each product
        const updatedProducts = [];
        
        for (const product of productsToUpdate) {
            const updatedProduct = await Product.findByIdAndUpdate(
                product._id,
                {
                    discountPercentage,
                    isDiscounted: true
                },
                { new: true }
            );
            
            updatedProducts.push(updatedProduct);
        }
        
        res.status(200).json({
            success: true,
            count: updatedProducts.length,
            data: updatedProducts
        });
    } catch (err) {
        console.error('Auto discount error:', err);
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
});

// Add new product (retailers only)
router.post('/', protect, authorize('retailer'), async (req, res) => {
    try {
        // Add retailer ID to product
        req.body.retailer = req.user.id;
        
        const product = await Product.create(req.body);
        
        res.status(201).json({
            success: true,
            data: product
        });
    } catch (err) {
        console.error('Create product error:', err);
        
        if (err.name === 'ValidationError') {
            const messages = Object.values(err.errors).map(val => val.message);
            return res.status(400).json({ success: false, message: messages.join(', ') });
        }
        
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
});

/**
 * PARAMETER ROUTES - Must come AFTER path-specific routes
 */

// Get single product (public)
router.get('/:id', async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }
        
        res.status(200).json({
            success: true,
            data: product
        });
    } catch (err) {
        console.error('Get product error:', err);
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
});

// Update product (retailers only)
router.put('/:id', protect, authorize('retailer'), async (req, res) => {
    try {
        let product = await Product.findById(req.params.id);
        
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }
        
        // Make sure retailer owns the product
        if (product.retailer.toString() !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Not authorized to update this product' });
        }
        
        product = await Product.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });
        
        res.status(200).json({
            success: true,
            data: product
        });
    } catch (err) {
        console.error('Update product error:', err);
        
        if (err.name === 'ValidationError') {
            const messages = Object.values(err.errors).map(val => val.message);
            return res.status(400).json({ success: false, message: messages.join(', ') });
        }
        
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
});

// Delete product (retailers only)
router.delete('/:id', protect, authorize('retailer'), async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }
        
        // Make sure retailer owns the product
        if (product.retailer.toString() !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Not authorized to delete this product' });
        }
        
        await Product.findByIdAndDelete(req.params.id);
        
        res.status(200).json({
            success: true,
            data: {}
        });
    } catch (err) {
        console.error('Delete product error:', err);
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
});

// Update product quantity (retailers only)
router.patch('/:id/quantity', protect, authorize('retailer'), async (req, res) => {
    try {
        const { quantity } = req.body;
        
        if (quantity === undefined) {
            return res.status(400).json({ success: false, message: 'Quantity is required' });
        }
        
        let product = await Product.findById(req.params.id);
        
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }
        
        // Make sure retailer owns the product
        if (product.retailer.toString() !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Not authorized to update this product' });
        }
        
        product = await Product.findByIdAndUpdate(
            req.params.id, 
            { quantity }, 
            { new: true, runValidators: true }
        );
        
        res.status(200).json({
            success: true,
            data: product
        });
    } catch (err) {
        console.error('Update quantity error:', err);
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
});

// Apply discount to product (retailers only)
router.patch('/:id/discount', protect, authorize('retailer'), async (req, res) => {
    try {
        console.log('DISCOUNT ROUTE HIT with ID:', req.params.id);
        const { discountPercentage } = req.body;
        
        if (discountPercentage === undefined) {
            return res.status(400).json({ success: false, message: 'Discount percentage is required' });
        }
        
        if (discountPercentage < 0 || discountPercentage > 100) {
            return res.status(400).json({ success: false, message: 'Discount percentage must be between 0 and 100' });
        }
        
        let product = await Product.findById(req.params.id);
        console.log('FOUND PRODUCT:', !!product);
        
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }
        
        // Make sure retailer owns the product
        if (product.retailer.toString() !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Not authorized to update this product' });
        }
        
        product = await Product.findByIdAndUpdate(
            req.params.id, 
            { 
                discountPercentage,
                isDiscounted: discountPercentage > 0
            }, 
            { new: true, runValidators: true }
        );
        
        res.status(200).json({
            success: true,
            data: product
        });
    } catch (err) {
        console.error('Apply discount error:', err);
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
});

// Remove discount from product (retailers only)
router.patch('/:id/remove-discount', protect, authorize('retailer'), async (req, res) => {
    try {
        let product = await Product.findById(req.params.id);
        
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }
        
        // Make sure retailer owns the product
        if (product.retailer.toString() !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Not authorized to update this product' });
        }
        
        product = await Product.findByIdAndUpdate(
            req.params.id,
            {
                discountPercentage: 0,
                isDiscounted: false
            },
            { new: true, runValidators: true }
        );
        
        res.status(200).json({
            success: true,
            data: product
        });
    } catch (err) {
        console.error('Remove discount error:', err);
        res.status(500).json({ success: false, message: 'Server error', error: err.message });
    }
});

module.exports = router; 