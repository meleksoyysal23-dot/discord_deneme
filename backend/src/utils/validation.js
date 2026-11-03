/**
 * Payload Validation Utilities
 * WebRTC signaling payloads için validation
 * Güvenlik ve stability için type checking
 */

import { logger } from './logger.js';
import {
  SDP_MAX_LENGTH,
  SDP_VALID_TYPES,
  ICE_CANDIDATE_MAX_LENGTH,
} from '../constants.js';

/**
 * SDP validation (offer/answer)
 * @param {*} sdp - SDP object
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateSDP(sdp) {
  if (!sdp || typeof sdp !== 'object') {
    return { valid: false, error: 'SDP must be an object' };
  }

  // Type kontrolü
  if (!sdp.type || typeof sdp.type !== 'string') {
    return { valid: false, error: 'SDP type is required and must be a string' };
  }

  if (!SDP_VALID_TYPES.includes(sdp.type)) {
    return {
      valid: false,
      error: `SDP type must be one of: ${SDP_VALID_TYPES.join(', ')}`,
    };
  }

  // SDP string kontrolü
  if (!sdp.sdp || typeof sdp.sdp !== 'string') {
    return { valid: false, error: 'SDP string is required and must be a string' };
  }

  // Boyut kontrolü
  if (sdp.sdp.length > SDP_MAX_LENGTH) {
    return {
      valid: false,
      error: `SDP exceeds maximum length of ${SDP_MAX_LENGTH} characters`,
    };
  }

  // Minimum boyut kontrolü (çok küçük SDP'ler şüpheli)
  if (sdp.sdp.length < 50) {
    return {
      valid: false,
      error: 'SDP appears to be too short or malformed',
    };
  }

  return { valid: true };
}

/**
 * ICE Candidate validation
 * @param {*} candidate - ICE candidate object
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateIceCandidate(candidate) {
  if (!candidate || typeof candidate !== 'object') {
    return { valid: false, error: 'ICE candidate must be an object' };
  }

  // Candidate string kontrolü
  if (!candidate.candidate || typeof candidate.candidate !== 'string') {
    return {
      valid: false,
      error: 'ICE candidate string is required and must be a string',
    };
  }

  // Boyut kontrolü
  if (candidate.candidate.length > ICE_CANDIDATE_MAX_LENGTH) {
    return {
      valid: false,
      error: `ICE candidate exceeds maximum length of ${ICE_CANDIDATE_MAX_LENGTH} characters`,
    };
  }

  // sdpMid ve sdpMLineIndex optional ama varsa validate et
  if (candidate.sdpMid !== undefined && candidate.sdpMid !== null) {
    if (typeof candidate.sdpMid !== 'string') {
      return { valid: false, error: 'sdpMid must be a string if provided' };
    }
  }

  if (candidate.sdpMLineIndex !== undefined && candidate.sdpMLineIndex !== null) {
    if (typeof candidate.sdpMLineIndex !== 'number' || !Number.isInteger(candidate.sdpMLineIndex)) {
      return { valid: false, error: 'sdpMLineIndex must be an integer if provided' };
    }
  }

  return { valid: true };
}

/**
 * Target user ID validation (signaling için)
 * @param {*} targetUserId
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateTargetUserId(targetUserId) {
  if (!targetUserId || typeof targetUserId !== 'string') {
    return { valid: false, error: 'targetUserId is required and must be a string' };
  }

  const trimmed = targetUserId.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'targetUserId cannot be empty' };
  }

  if (trimmed.length > 50) {
    return { valid: false, error: 'targetUserId exceeds maximum length of 50' };
  }

  // Alphanumeric, dash, underscore only
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return {
      valid: false,
      error: 'targetUserId contains invalid characters (only alphanumeric, dash, underscore allowed)',
    };
  }

  return { valid: true, value: trimmed };
}

/**
 * Generic object validation helper
 * @param {*} obj - Object to validate
 * @param {string} name - Object name for error messages
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateObject(obj, name) {
  if (!obj || typeof obj !== 'object') {
    return { valid: false, error: `${name} must be an object` };
  }
  if (Array.isArray(obj)) {
    return { valid: false, error: `${name} must be an object, not an array` };
  }
  return { valid: true };
}

/**
 * String validation helper
 * @param {*} str - String to validate
 * @param {string} name - Field name for error messages
 * @param {number} maxLength - Maximum length
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateString(str, name, maxLength) {
  if (!str || typeof str !== 'string') {
    return { valid: false, error: `${name} is required and must be a string` };
  }

  const trimmed = str.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: `${name} cannot be empty` };
  }

  if (trimmed.length > maxLength) {
    return {
      valid: false,
      error: `${name} exceeds maximum length of ${maxLength}`,
    };
  }

  return { valid: true, value: trimmed };
}
