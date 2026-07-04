import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, X } from 'lucide-react';

const DISMISS_KEY = 'install-banner-dismissed-at';
const DISMISS_MS = 1000 * 60 * 60 * 24 * 3; // 3 days

export const InstallAppBanner = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [visible, setVisible] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSHelp, setShowIOSHelp] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    const inIframe = window.self !== window.top;
    const ios = /iPad|iPhone|iPod/.test(ua);
    setIsIOS(ios);

    if (!isMobile || standalone || inIframe) return;

    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
    if (dismissedAt && Date.now() - dismissedAt < DISMISS_MS) return;

    setVisible(true);

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => setVisible(false));
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
  };

  const install = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
        setVisible(false);
      }
    } else if (isIOS) {
      setShowIOSHelp(true);
    } else {
      setShowIOSHelp(true);
    }
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[100] p-3 sm:hidden">
      <div className="mx-auto max-w-md rounded-2xl border bg-card p-4 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Download className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Download the app</p>
            <p className="text-xs text-muted-foreground">
              Install GAF Media for a faster app-like experience.
            </p>
            {showIOSHelp && (
              <p className="mt-2 text-xs text-muted-foreground">
                {isIOS
                  ? 'Tap the Share icon in Safari, then choose "Add to Home Screen".'
                  : 'Open your browser menu and choose "Install app" or "Add to Home Screen".'}
              </p>
            )}
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={install} className="flex-1">
                Install
              </Button>
              <Button size="sm" variant="ghost" onClick={dismiss}>
                Not now
              </Button>
            </div>
          </div>
          <button
            aria-label="Dismiss"
            onClick={dismiss}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};