const express = require('express');
const Product = require('../models/Product');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// Get surplus dashboard data (retailers only)
router.get('/dashboard', protect, authorize('retailer'), async (req, res) => {
  try {
    const today = new Date();
    
    // Near expiry products (status = near_expiry)
    const nearExpiryCount = await Product.countDocuments({
      retailer: req.user.id,
      status: 'near_expiry'
    });
    
    // Expired products
    const expiredCount = await Product.countDocuments({
      retailer: req.user.id,
      status: 'expired'
    });
    
    // Currently discounted products
    const discountedCount = await Product.countDocuments({
      retailer: req.user.id,
      isDiscounted: true
    });
    
    // Products expiring within different timeframes
    const expiringToday = await Product.countDocuments({
      retailer: req.user.id,
      expiryDate: {
        $gte: today,
        $lte: new Date(today.setHours(23, 59, 59, 999))
      }
    });
    
    today.setHours(0, 0, 0, 0); // Reset time part
    
    const expiringThisWeek = await Product.countDocuments({
      retailer: req.user.id,
      expiryDate: {
        $gte: today,
        $lte: new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
      }
    });
    
    // Calculate potential loss value (of near expiry non-discounted products)
    const potentialLossData = await Product.aggregate([
      { 
        $match: { 
          retailer: req.user.id,
          status: 'near_expiry',
          isDiscounted: false
        } 
      },
      { 
        $group: { 
          _id: null, 
          potentialLoss: { $sum: { $multiply: ['$price', '$quantity'] } },
          productCount: { $sum: 1 }
        } 
      }
    ]);
    
    const potentialLoss = potentialLossData.length > 0 ? potentialLossData[0].potentialLoss : 0;
    const nonDiscountedNearExpiryCount = potentialLossData.length > 0 ? potentialLossData[0].productCount : 0;
    
    // Calculate saved value (through discounting)
    const savedValueData = await Product.aggregate([
      { 
        $match: { 
          retailer: req.user.id,
          isDiscounted: true
        } 
      },
      { 
        $group: { 
          _id: null, 
          totalDiscount: { 
            $sum: { 
              $multiply: [
                '$price', 
                { $divide: ['$discountPercentage', 100] },
                '$quantity'
              ] 
            } 
          }
        } 
      }
    ]);
    
    const savedValue = savedValueData.length > 0 ? savedValueData[0].totalDiscount : 0;
    
    res.status(200).json({
      success: true,
      data: {
        nearExpiryCount,
        expiredCount,
        discountedCount,
        expiringToday,
        expiringThisWeek,
        potentialLoss,
        nonDiscountedNearExpiryCount,
        savedValue
      }
    });
  } catch (err) {
    console.error('Get surplus dashboard error:', err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

// Get near expiry products that need attention (retailers only)
router.get('/needs-attention', protect, authorize('retailer'), async (req, res) => {
  try {
    // Near expiry products that are not discounted yet
    const nonDiscountedNearExpiry = await Product.find({
      retailer: req.user.id,
      status: 'near_expiry',
      isDiscounted: false,
      quantity: { $gt: 0 }
    }).sort({ expiryDate: 1 });
    
    res.status(200).json({
      success: true,
      count: nonDiscountedNearExpiry.length,
      data: nonDiscountedNearExpiry
    });
  } catch (err) {
    console.error('Get needs attention error:', err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

// Auto-apply discounts to near expiry products (retailers only)
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
      status: 'near_expiry',
      quantity: { $gt: 0 },
      isDiscounted: false
    });
    
    // Apply discount to each product
    const updatedProducts = [];
    
    for (const product of productsToUpdate) {
      const updatedProduct = await Product.findByIdAndUpdate(
        product._id,
        {
          discountPercentage,
          isDiscounted: discountPercentage > 0
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

// Get surplus report (retailers only)
router.get('/reports', protect, authorize('retailer'), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Validate date range
    let dateFilter = { retailer: req.user.id };
    
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
      if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
    }
    
    // Get all products in the date range
    const products = await Product.find(dateFilter);
    
    // Calculate summary statistics
    const expiredProducts = products.filter(p => p.status === 'expired');
    const nearExpiryProducts = products.filter(p => p.status === 'near_expiry');
    const discountedProducts = products.filter(p => p.isDiscounted);
    
    // Calculate financial metrics
    const lossFromExpired = expiredProducts.reduce((sum, product) => {
      return sum + (product.price * product.quantity);
    }, 0);
    
    const savingsFromDiscounts = discountedProducts.reduce((sum, product) => {
      const regularValue = product.price * product.quantity;
      const discountedValue = regularValue * (1 - (product.discountPercentage / 100));
      return sum + (regularValue - discountedValue);
    }, 0);
    
    // Calculate average discount percentage
    const avgDiscountPercentage = discountedProducts.length > 0 
      ? discountedProducts.reduce((sum, p) => sum + p.discountPercentage, 0) / discountedProducts.length
      : 0;
    
    res.status(200).json({
      success: true,
      data: {
        summary: {
          totalProducts: products.length,
          expiredCount: expiredProducts.length,
          nearExpiryCount: nearExpiryProducts.length,
          discountedCount: discountedProducts.length,
          lossFromExpired,
          savingsFromDiscounts,
          avgDiscountPercentage
        },
        expiredProducts,
        nearExpiryProducts,
        discountedProducts
      }
    });
  } catch (err) {
    console.error('Get surplus report error:', err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

// Get recommended discounts based on expiry date (retailers only)
router.get('/recommendations', protect, authorize('retailer'), async (req, res) => {
  try {
    const today = new Date();
    
    // Products that are not discounted yet
    const nonDiscountedProducts = await Product.find({
      retailer: req.user.id,
      isDiscounted: false,
      quantity: { $gt: 0 }
    });
    
    // Generate discount recommendations based on expiry date
    const recommendations = nonDiscountedProducts.map(product => {
      const expiryDate = new Date(product.expiryDate);
      const daysUntilExpiry = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
      
      let recommendedDiscount = 0;
      let reason = '';
      
      if (daysUntilExpiry <= 1) {
        // Expires today or tomorrow
        recommendedDiscount = 70;
        reason = 'Expires within 24 hours';
      } else if (daysUntilExpiry <= 3) {
        // Expires within 3 days
        recommendedDiscount = 50;
        reason = 'Expires within 3 days';
      } else if (daysUntilExpiry <= 5) {
        // Expires within 5 days
        recommendedDiscount = 30;
        reason = 'Expires within 5 days';
      } else if (daysUntilExpiry <= 7) {
        // Expires within a week
        recommendedDiscount = 20;
        reason = 'Expires within a week';
      } else if (daysUntilExpiry <= 14) {
        // Expires within two weeks
        recommendedDiscount = 10;
        reason = 'Expires within two weeks';
      }
      
      return {
        product,
        daysUntilExpiry,
        recommendedDiscount,
        reason
      };
    }).filter(rec => rec.recommendedDiscount > 0);
    
    // Sort by urgency (lowest days until expiry first)
    recommendations.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
    
    res.status(200).json({
      success: true,
      count: recommendations.length,
      data: recommendations
    });
  } catch (err) {
    console.error('Get discount recommendations error:', err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

// Apply recommended discounts in bulk (retailers only)
router.post('/apply-recommendations', protect, authorize('retailer'), async (req, res) => {
  try {
    const { recommendations } = req.body;
    
    if (!recommendations || !Array.isArray(recommendations) || recommendations.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Recommendations array is required and must not be empty'
      });
    }
    
    const results = [];
    
    for (const rec of recommendations) {
      const { productId, discountPercentage } = rec;
      
      if (!productId || !discountPercentage) {
        results.push({
          productId,
          success: false,
          message: 'Product ID and discount percentage are required'
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
        
        // Update the product with the discount
        const updatedProduct = await Product.findByIdAndUpdate(
          productId,
          {
            discountPercentage,
            isDiscounted: discountPercentage > 0
          },
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
    console.error('Apply recommendations error:', err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

module.exports = router; 