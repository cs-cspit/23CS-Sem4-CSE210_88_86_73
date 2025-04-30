const express = require('express');
const Product = require('../models/Product');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// Get inventory dashboard data (retailers only)
router.get('/dashboard', protect, authorize('retailer'), async (req, res) => {
  try {
    // Get total product count
    const totalProducts = await Product.countDocuments({ retailer: req.user.id });
    
    // Get product counts by category
    const categoryCounts = await Product.aggregate([
      { $match: { retailer: req.user.id } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    // Get expiration status counts
    const expiryStatusCounts = await Product.aggregate([
      { $match: { retailer: req.user.id } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    
    // Calculate total inventory value
    const inventoryValue = await Product.aggregate([
      { $match: { retailer: req.user.id } },
      { $group: { 
        _id: null, 
        totalValue: { 
          $sum: { 
            $multiply: [
              '$price', 
              { $subtract: [1, { $divide: ['$discountPercentage', 100] }] },
              '$quantity'
            ] 
          } 
        } 
      }}
    ]);
    
    // Calculate low stock items (less than 5 units)
    const lowStockCount = await Product.countDocuments({
      retailer: req.user.id,
      quantity: { $gt: 0, $lt: 5 }
    });
    
    // Calculate out of stock items
    const outOfStockCount = await Product.countDocuments({
      retailer: req.user.id,
      quantity: 0
    });
    
    res.status(200).json({
      success: true,
      data: {
        totalProducts,
        categoryCounts,
        expiryStatusCounts,
        inventoryValue: inventoryValue.length > 0 ? inventoryValue[0].totalValue : 0,
        lowStockCount,
        outOfStockCount
      }
    });
  } catch (err) {
    console.error('Get inventory dashboard error:', err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

// Get inventory report (retailers only)
router.get('/reports', protect, authorize('retailer'), async (req, res) => {
  try {
    // Get query parameters for filtering
    const { category, status, sortBy, sortOrder } = req.query;
    
    // Build filter object
    const filter = { retailer: req.user.id };
    if (category) filter.category = category;
    if (status) filter.status = status;
    
    // Build sort object
    const sort = {};
    if (sortBy) {
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
    } else {
      sort.createdAt = -1; // Default sort by newest
    }
    
    // Get filtered products
    const products = await Product.find(filter).sort(sort);
    
    // Calculate summary statistics
    const totalProducts = products.length;
    const totalValue = products.reduce((sum, product) => {
      const discountedPrice = product.price * (1 - (product.discountPercentage / 100));
      return sum + (discountedPrice * product.quantity);
    }, 0);
    
    const totalQuantity = products.reduce((sum, product) => sum + product.quantity, 0);
    
    res.status(200).json({
      success: true,
      data: {
        summary: {
          totalProducts,
          totalValue,
          totalQuantity
        },
        products
      }
    });
  } catch (err) {
    console.error('Get inventory report error:', err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

// Get inventory by expiry timeline (retailers only)
router.get('/expiry-timeline', protect, authorize('retailer'), async (req, res) => {
  try {
    const today = new Date();
    
    // Products expiring within a week
    const expiringThisWeek = await Product.find({
      retailer: req.user.id,
      expiryDate: {
        $gte: today,
        $lte: new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
      }
    }).sort({ expiryDate: 1 });
    
    // Products expiring within a month
    const expiringThisMonth = await Product.find({
      retailer: req.user.id,
      expiryDate: {
        $gt: new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000),
        $lte: new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)
      }
    }).sort({ expiryDate: 1 });
    
    // Already expired products
    const expired = await Product.find({
      retailer: req.user.id,
      expiryDate: { $lt: today }
    }).sort({ expiryDate: -1 });
    
    res.status(200).json({
      success: true,
      data: {
        expiringThisWeek,
        expiringThisMonth,
        expired
      }
    });
  } catch (err) {
    console.error('Get expiry timeline error:', err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

// Get stock alerts (retailers only)
router.get('/stock-alerts', protect, authorize('retailer'), async (req, res) => {
  try {
    // Low stock products (less than 5 units)
    const lowStock = await Product.find({
      retailer: req.user.id,
      quantity: { $gt: 0, $lt: 5 }
    }).sort({ quantity: 1 });
    
    // Out of stock products
    const outOfStock = await Product.find({
      retailer: req.user.id,
      quantity: 0
    });
    
    // Overstocked products (more than 50 units, can be customized)
    const overStocked = await Product.find({
      retailer: req.user.id,
      quantity: { $gt: 50 }
    }).sort({ quantity: -1 });
    
    res.status(200).json({
      success: true,
      data: {
        lowStock,
        outOfStock,
        overStocked
      }
    });
  } catch (err) {
    console.error('Get stock alerts error:', err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

// Bulk update product quantities (retailers only)
router.patch('/bulk-update', protect, authorize('retailer'), async (req, res) => {
  try {
    const { updates } = req.body;
    
    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Updates array is required and must not be empty'
      });
    }
    
    const results = [];
    
    // Process each update
    for (const update of updates) {
      const { productId, quantity } = update;
      
      if (!productId || quantity === undefined) {
        results.push({
          productId,
          success: false,
          message: 'Product ID and quantity are required'
        });
        continue;
      }
      
      try {
        const product = await Product.findById(productId);
        
        if (!product) {
          results.push({
            productId,
            success: false,
            message: 'Product not found'
          });
          continue;
        }
        
        // Make sure retailer owns the product
        if (product.retailer.toString() !== req.user.id) {
          results.push({
            productId,
            success: false,
            message: 'Not authorized to update this product'
          });
          continue;
        }
        
        // Update the product
        const updatedProduct = await Product.findByIdAndUpdate(
          productId,
          { quantity },
          { new: true, runValidators: true }
        );
        
        results.push({
          productId,
          success: true,
          data: updatedProduct
        });
      } catch (error) {
        results.push({
          productId,
          success: false,
          message: error.message
        });
      }
    }
    
    res.status(200).json({
      success: true,
      data: results
    });
  } catch (err) {
    console.error('Bulk update error:', err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

module.exports = router; 