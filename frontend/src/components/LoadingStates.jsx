/**
 * LoadingSpinner Component
 * Reusable loading spinner with optional message
 */

export function LoadingSpinner({ message = 'Yükleniyor...', size = 'md' }) {
  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-10 h-10',
    lg: 'w-16 h-16',
  };

  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <div
        className={`${sizeClasses[size]} border-4 border-slate-700 border-t-blue-500 rounded-full animate-spin`}
      />
      {message && (
        <p className="text-slate-400 text-sm">{message}</p>
      )}
    </div>
  );
}

/**
 * SkeletonLoader Component
 * Skeleton loading placeholder for content
 */
export function SkeletonLoader({ lines = 3, className = '' }) {
  return (
    <div className={`animate-pulse space-y-3 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-4 bg-slate-700 rounded"
          style={{ width: `${Math.random() * 40 + 60}%` }}
        />
      ))}
    </div>
  );
}

/**
 * UserAvatarSkeleton Component
 * Skeleton loader for user avatar
 */
export function UserAvatarSkeleton() {
  return (
    <div className="flex flex-col items-center gap-2 animate-pulse">
      <div className="w-20 h-20 bg-slate-700 rounded-full" />
      <div className="h-4 w-16 bg-slate-700 rounded" />
    </div>
  );
}

/**
 * RoomSkeleton Component
 * Skeleton loader for room view
 */
export function RoomSkeleton() {
  return (
    <div className="min-h-screen bg-slate-900 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header skeleton */}
        <div className="mb-8 animate-pulse">
          <div className="h-8 w-48 bg-slate-700 rounded mb-2" />
          <div className="h-4 w-32 bg-slate-700 rounded" />
        </div>

        {/* User grid skeleton */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          {Array.from({ length: 4 }).map((_, i) => (
            <UserAvatarSkeleton key={i} />
          ))}
        </div>

        {/* Control bar skeleton */}
        <div className="flex justify-center gap-4 animate-pulse">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="w-16 h-16 bg-slate-700 rounded-full" />
          ))}
        </div>
      </div>
    </div>
  );
}