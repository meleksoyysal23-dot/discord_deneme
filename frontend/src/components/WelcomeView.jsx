/**
 * WelcomeView Component
 * Hiçbir kanal seçili değilken, veya seçilen kanal gösterilemezken
 * (örn. ses kanalı bağlantı hatası) gösterilen karşılama ekranı.
 *
 * @param {object} [props]
 * @param {object} [props.channel] - Seçili kanal (opsiyonel)
 * @param {string|null} [props.notice] - Uyarı mesajı (opsiyonel)
 */
export function WelcomeView({ channel, notice }) {
  const isVoice =
    channel?.type === 'VOICE' || channel?.type === 'STAGE';
  const title = isVoice && channel?.name ? channel.name : 'Bir kanal seç';
  const icon = isVoice ? '🔊' : '💬';

  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-0 overflow-y-auto p-6 text-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      <div className="w-20 h-20 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center mb-5 text-4xl">
        {icon}
      </div>
      <h2 className="text-2xl font-bold text-white mb-2">{title}</h2>
      {notice ? (
        <p className="text-red-400 max-w-sm mb-2">{notice}</p>
      ) : null}
      <p className="text-gray-400 max-w-sm">
        {isVoice
          ? 'Ses kanalına katılmak için sunucu bağlantısı gerekli. Bağlantı kurulduğunda otomatik olarak katılacaksın.'
          : 'Sol taraftaki listeden bir metin veya ses kanalı seçerek sohbete başla.'}
      </p>
    </div>
  );
}

export default WelcomeView;
