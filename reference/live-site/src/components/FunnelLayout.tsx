import { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft } from 'lucide-react';
import { SiteMenu } from '@/components/SiteMenu';
import { CartStatusButton } from '@/components/CartStatusButton';
import { Footer } from '@/components/Footer';
import logo from '@/assets/MP-Logo-2.svg';

interface FunnelLayoutProps {
  children: ReactNode;
  variant: 'home' | 'titled' | 'minimal';
  title?: string;
  showBack?: boolean;
  backTo?: string;
  showFooter?: boolean;
  /** `home` only: leave out the menu button (logo + cart only). */
  hideMenu?: boolean;
}

export function FunnelLayout({
  children,
  variant,
  title,
  showBack,
  backTo,
  showFooter,
  hideMenu,
}: FunnelLayoutProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const onBack = () => (backTo ? navigate(backTo) : navigate(-1));

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70 border-b border-border">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center relative">
          {variant === 'home' && (
            <>
              <div className="flex items-center">
                {!hideMenu && <SiteMenu />}
              </div>
              <img
                src={logo}
                alt="Magic Portraits AI"
                className="absolute left-1/2 -translate-x-1/2 h-9 w-auto"
              />
              <div className="absolute right-4">
                <CartStatusButton />
              </div>
            </>
          )}
          {variant === 'titled' && (
            <>
              {showBack ? (
                <button
                  onClick={onBack}
                  className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  {t('ui.back')}
                </button>
              ) : <span className="w-12" />}
              <span className="absolute left-1/2 -translate-x-1/2 text-base font-semibold text-foreground">
                {title}
              </span>
              <div className="absolute right-4">
                <CartStatusButton />
              </div>
            </>
          )}
          {variant === 'minimal' && (
            <>
              <span className="absolute left-1/2 -translate-x-1/2 text-base font-semibold text-foreground text-center px-8 truncate max-w-[80%]">
                {title}
              </span>
              <div className="absolute right-4">
                <CartStatusButton />
              </div>
            </>
          )}
        </div>
      </header>

      <main className="flex-1">{children}</main>

      {showFooter && <Footer />}
    </div>
  );
}
