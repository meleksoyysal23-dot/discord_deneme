/**
 * Notification Sounds Utility
 * Play sounds for various events
 */

const SOUNDS = {
  userJoined: new URL('../assets/sounds/user-joined.mp3', import.meta.url).href,
  userLeft: new URL('../assets/sounds/user-left.mp3', import.meta.url).href,
  chatMessage: new URL('../assets/sounds/chat-message.mp3', import.meta.url).href,
  connectionLost: new URL('../assets/sounds/connection-lost.mp3', import.meta.url).href,
};

let audioContext = null;

function getAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioContext;
}

/**
 * Play a notification sound
 * @param {string} soundName - Name of the sound to play
 * @param {number} volume - Volume (0-1), default 0.5
 */
export function playSound(soundName, volume = 0.5) {
  try {
    const ctx = getAudioContext();
    
    // Resume audio context if suspended (browser autoplay policy)
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    // Different tones for different sounds
    const tones = {
      userJoined: { frequency: 800, duration: 0.15 },
      userLeft: { frequency: 400, duration: 0.15 },
      chatMessage: { frequency: 600, duration: 0.1 },
      connectionLost: { frequency: 200, duration: 0.3 },
    };

    const tone = tones[soundName] || tones.chatMessage;

    oscillator.frequency.value = tone.frequency;
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(volume, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + tone.duration);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + tone.duration);
  } catch (error) {
    console.warn('Failed to play sound:', error);
  }
}

/**
 * Enable/disable sound notifications
 */
let soundEnabled = true;

export function setSoundEnabled(enabled) {
  soundEnabled = enabled;
  localStorage.setItem('vibe-voice-sound-enabled', enabled ? 'true' : 'false');
}

export function isSoundEnabled() {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('vibe-voice-sound-enabled');
    if (stored !== null) {
      soundEnabled = stored === 'true';
    }
  }
  return soundEnabled;
}

/**
 * Play sound if enabled
 */
export function playSoundIfEnabled(soundName, volume = 0.5) {
  if (isSoundEnabled()) {
    playSound(soundName, volume);
  }
}