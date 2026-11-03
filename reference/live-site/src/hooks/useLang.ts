import { useLocation } from 'react-router-dom';
import { langFromPath, type Lang } from '@/lib/langRoutes';

/** The active language, derived from the URL. */
export function useLang(): Lang {
  const { pathname } = useLocation();
  return langFromPath(pathname);
}
