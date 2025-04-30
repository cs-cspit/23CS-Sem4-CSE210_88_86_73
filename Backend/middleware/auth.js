const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware to authenticate users
const protect = async (req, res, next) => {
    try {
        // Get token from header
        const token = req.header('Authorization')?.replace('Bearer ', '');

        if (!token) {
            return res.status(401).json({ success: false, message: 'No token, authorization denied' });
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secretKey');

        // Find user by id
        const user = await User.findById(decoded.id).select('-password');

        if (!user) {
            return res.status(401).json({ success: false, message: 'User not found' });
        }

        // Set user in request object
        req.user = user;
        next();
    } catch (err) {
        console.error('Auth middleware error:', err);
        return res.status(401).json({ success: false, message: 'Token is not valid' });
    }
};

// Middleware to authorize specific roles
const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Not authorized' });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ 
                success: false, 
                message: `Role '${req.user.role}' is not authorized to access this resource` 
            });
        }

        next();
    };
};

module.exports = { protect, authorize }; 