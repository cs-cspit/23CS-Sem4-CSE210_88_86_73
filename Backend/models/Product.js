const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Product name is required'],
        trim: true
    },
    description: {
        type: String,
        required: [true, 'Product description is required'],
        trim: true
    },
    category: {
        type: String,
        required: [true, 'Product category is required'],
        trim: true
    },
    price: {
        type: Number,
        required: [true, 'Product price is required'],
        min: [0, 'Price cannot be negative']
    },
    quantity: {
        type: Number,
        required: [true, 'Product quantity is required'],
        min: [0, 'Quantity cannot be negative']
    },
    expiryDate: {
        type: Date,
        required: [true, 'Expiry date is required']
    },
    status: {
        type: String,
        enum: ['fresh', 'near_expiry', 'expired'],
        default: 'fresh'
    },
    discountPercentage: {
        type: Number,
        default: 0,
        min: [0, 'Discount cannot be negative'],
        max: [100, 'Discount cannot exceed 100%']
    },
    image: {
        type: String,
        default: 'default-product.jpg'
    },
    retailer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    barcode: {
        type: String,
        trim: true
    },
    isDiscounted: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Virtual for calculating days until expiry
productSchema.virtual('daysUntilExpiry').get(function() {
    const today = new Date();
    const expiryDate = new Date(this.expiryDate);
    const diffTime = Math.abs(expiryDate - today);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
});

// Pre-save middleware to update status based on expiry date
productSchema.pre('save', function(next) {
    const today = new Date();
    const expiryDate = new Date(this.expiryDate);
    const diffTime = Math.abs(expiryDate - today);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (expiryDate < today) {
        this.status = 'expired';
    } else if (diffDays <= 7) {
        this.status = 'near_expiry';
    } else {
        this.status = 'fresh';
    }
    
    console.log('Saving product with ID:', this._id.toString());
    next();
});

// Add remove method for backward compatibility with older mongoose versions
productSchema.method('remove', async function() {
    return this.constructor.findByIdAndDelete(this._id);
}, { suppressWarning: true });

module.exports = mongoose.model('Product', productSchema); 