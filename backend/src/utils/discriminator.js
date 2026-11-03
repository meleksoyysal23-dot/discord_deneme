import prisma from '../lib/prisma.js';

/**
 * Generates a unique discriminator in #1234 format
 * Tries to find an unused 4-digit number
 * @returns {Promise<string>} A unique discriminator like "#1234"
 */
export async function generateDiscriminator() {
  const maxAttempts = 100;
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Generate random 4-digit number (0001-9999)
    const num = Math.floor(Math.random() * 9999) + 1;
    const discriminator = String(num).padStart(4, '0');
    
    // Check if this discriminator is already in use
    const existing = await prisma.user.findUnique({
      where: { discriminator }
    });
    
    if (!existing) {
      return discriminator;
    }
  }
  
  // If we exhausted all attempts, throw an error
  throw new Error('Unable to generate unique discriminator after maximum attempts');
}

/**
 * Validates discriminator format
 * @param {string} discriminator - The discriminator to validate
 * @returns {boolean} True if valid format
 */
export function isValidDiscriminator(discriminator) {
  return /^\d{4}$/.test(discriminator);
}