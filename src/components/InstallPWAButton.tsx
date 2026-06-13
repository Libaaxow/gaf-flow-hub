import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { toast } from 'sonner';

export const InstallPWAButton = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    setIsInstalled(standalone);

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => setIsInstalled(true));
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') setDeferredPrompt(null);
    } else {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      toast.info(
        isIOS
          ? 'Tap the Share button in Safari, then "Add to Home Screen".'
          : 'Open your browser menu and choose "Install app" or "Add to Home Screen".'
      );
    }
  };

  if (isInstalled) return null;

  return (
    <Button
      variant="outline"
      size="sm"
      className="w-full justify-start lg:hidden"
      onClick={handleInstall}
    >
      <Download className="mr-2 h-4 w-4" />
      Install App
    </Button>
  );
};