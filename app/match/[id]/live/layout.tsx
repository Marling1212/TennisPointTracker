/**
 * Spectator page: full viewport width (escapes root max-w-md) and no bottom nav padding.
 */
export default function SpectatorLiveLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex min-h-0 flex-col overflow-y-auto bg-black print:relative print:inset-auto print:min-h-screen">
      {children}
    </div>
  );
}
