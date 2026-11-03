/**
 * Room Component - Legacy Wrapper
 * 
 * Bu dosya artık kullanılmıyor. App.jsx doğrudan VoiceRoomView kullanıyor.
 * Geriye uyumluluk için boş export.
 */

export function Room() {
  console.warn('Room component is deprecated. Use VoiceRoomView instead.');
  return null;
}

export default Room;
