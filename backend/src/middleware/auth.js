/**
 * JWT Authentication Middleware
 * Token validation and user authentication for protected routes
 */

import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';
import { logger } from '../utils/logger.js';

/**
 * Authenticate JWT token middleware
 * Extracts and validates JWT from Authorization header
 * Attaches user object to request if valid
 */
export function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access token required',
      });
    }

    // Verify token
    jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
      if (err) {
        if (err.name === 'TokenExpiredError') {
          return res.status(401).json({
            success: false,
            error: 'Token expired',
          });
        }
        return res.status(403).json({
          success: false,
          error: 'Invalid or expired token',
        });
      }

      // Fetch user from database to ensure they still exist
      try {
        const user = await prisma.user.findUnique({
          where: { id: decoded.userId },
          select: {
            id: true,
            username: true,
            discriminator: true,
            displayName: true,
            avatar: true,
            banner: true,
            about: true,
            status: true,
            customStatus: true,
            superAdmin: true,
            createdAt: true,
          },
        });

        if (!user) {
          return res.status(401).json({
            success: false,
            error: 'User not found',
          });
        }

        // Attach user to request
        req.user = user;
        next();
      } catch (dbError) {
        logger.error('Auth middleware database error:', dbError.message);
        return res.status(500).json({
          success: false,
          error: 'Authentication error',
        });
      }
    });
  } catch (error) {
    logger.error('Auth middleware error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Authentication error',
    });
  }
}

/**
 * Generate JWT token for user
 * @param {string} userId - User ID
 * @returns {string} JWT token
 */
export function generateToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: '7d', // 7 gün geçerli
  });
}

/**
 * Verify JWT token (for Socket.io)
 * @param {string} token - JWT token
 * @returns {Promise<object>} Decoded token payload
 */
export async function verifyToken(token) {
  return new Promise((resolve, reject) => {
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) {
        reject(err);
      } else {
        resolve(decoded);
      }
    });
  });
}
