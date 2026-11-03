import { forwardRef } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { localizePath } from '@/lib/langRoutes';
import { useLang } from '@/hooks/useLang';

/** <Link> that preserves the active language prefix. */
export const LocalizedLink = forwardRef<HTMLAnchorElement, LinkProps>(
  ({ to, ...props }, ref) => {
    const lang = useLang();
    const localized = typeof to === 'string' ? localizePath(to, lang) : to;
    return <Link ref={ref} to={localized} {...props} />;
  },
);
LocalizedLink.displayName = 'LocalizedLink';
