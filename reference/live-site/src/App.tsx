import { useEffect } from "react";
import Intercom from "@intercom/messenger-js-sdk";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useSearchParams } from "react-router-dom";
import { trackPageView } from "@/lib/analytics";
import { captureTrackingParams, getTrackingParams } from "@/lib/trackingParams";
import { useFunnelTracking } from "@/hooks/useFunnelTracking";
import { SUPPORTED_LANGS } from "@/lib/langRoutes";
import { LanguageSync } from "@/components/LanguageSync";
import Index from "./pages/Index";
import AppPage from "./pages/App";
import CMSPage from "./pages/CMS";
import TilesPage from "./pages/Tiles";
import TilesBundlePage from "./pages/TilesBundle";
import UploadPage from "./pages/Upload";
import BoardsPage from "./pages/Boards";
import OfferPage from "./pages/Offer";
import Offer2Page from "./pages/Offer2";
import OrderReviewPage from "./pages/OrderReview";
import Reveal from "./pages/Reveal";
import PhotobookPage from "./pages/Photobook";
import VIPPortal from "./pages/VIPPortal";
import TestPage from "./pages/Test";
import Lptemp from "./pages/Lptemp";
import Start from "./pages/Start";
import Memorial from "./pages/Memorial";
import About from "./pages/About";
import Redeem from "./pages/Redeem";
import Faq from "./pages/Faq";
import DataDeletion from "./pages/DataDeletion";

import Theme from "./pages/Theme";
import Confirm from "./pages/Confirm";
import Generating from "./pages/Generating";
import SelectFaces from "./pages/SelectFaces";
import PhotoTiles from "./pages/PhotoTiles";
import PhotoAlbum from "./pages/PhotoAlbum";
import NotFound from "./pages/NotFound";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import FaceswapLanding from "./pages/faceswap/FaceswapLanding";
import FaceswapUpload from "./pages/faceswap/FaceswapUpload";
import FaceswapReview from "./pages/faceswap/FaceswapReview";
import Masterpiece from "./pages/Masterpiece";

const queryClient = new QueryClient();

// Analytics tracker component
function AnalyticsTracker() {
  const location = useLocation();

  useEffect(() => {
    trackPageView(location.pathname, document.title);
  }, [location.pathname]);

  return null;
}

/**
 * Tracking params synchronizer.
 *
 * Ensures captured tracking params (fbclid, gclid, click_id,
 * utm_*) persist on the URL across all navigation — menu
 * clicks, footer clicks, imperative navigate(), back/forward,
 * and setSearchParams calls that would otherwise drop them.
 *
 * On every location change:
 *   1. Capture any URL-borne tracking params into sessionStorage
 *      (idempotent — URL-absent keys don't wipe stored values).
 *   2. Read the canonical stored params.
 *   3. Inject any stored params that are missing from the URL.
 *   4. Use replace: true so the URL fix doesn't pollute history.
 *
 * Add-only semantics: if a key is already present on the URL,
 * sync does NOT overwrite. URL wins for the current navigation.
 */
function TrackingParamsSync() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    captureTrackingParams();

    const stored = getTrackingParams();
    const next = new URLSearchParams(searchParams);
    let modified = false;

    for (const [key, value] of Object.entries(stored)) {
      if (!next.has(key)) {
        next.set(key, value);
        modified = true;
      }
    }

    if (modified) {
      setSearchParams(next, { replace: true });
    }
  }, [location.pathname, location.search]);

  return null;
}

Intercom({ app_id: '<REDACTED: INTERCOM_APP_ID>', hide_default_launcher: true });

function RootRedirect() {
  const { search, hash } = useLocation();
  const params = new URLSearchParams(search);
  if (params.get("cat") === "human") {
    params.delete("cat");
    const nextSearch = params.toString();
    return <Navigate to={{ pathname: "/humans", search: nextSearch ? `?${nextSearch}` : "", hash }} replace />;
  }
  return <Navigate to={{ pathname: "/start", search, hash }} replace />;
}


// Phase 1: the funnel pages that get language-prefixed variants
// (/es/start, /fr/theme, …). English routes below stay unprefixed.
const LOCALIZED_ROUTES: Array<{ path: string; element: JSX.Element }> = [
  // Funnel
  { path: "/start", element: <Start /> },
  { path: "/humans", element: <Start /> },
  { path: "/theme", element: <Theme /> },
  { path: "/confirm", element: <Confirm /> },
  { path: "/generating", element: <Generating /> },
  { path: "/select-faces", element: <SelectFaces /> },
  // Unprefixed /order stays registered below and MUST remain — every recovery
  // email Sarah has already sent points at it.
  { path: "/order", element: <OrderReviewPage /> },
  { path: "/reveal", element: <Reveal /> },
  // Marketing / content. Routes exist so navigation stays inside the
  // chosen language; page copy is translated incrementally.
  { path: "/memorial", element: <Memorial /> },
  { path: "/masterpiece", element: <Masterpiece /> },
  { path: "/masterpiece/:slug", element: <Masterpiece /> },
  { path: "/photo-tiles", element: <PhotoTiles /> },
  { path: "/photo-books", element: <PhotoAlbum /> },
  { path: "/about", element: <About /> },
  { path: "/faq", element: <Faq /> },
];

const App = () => {
  useFunnelTracking();

  return (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AnalyticsTracker />
        <TrackingParamsSync />
        <LanguageSync />

        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/reset" element={<Index />} />
          <Route path="/product" element={<AppPage />} />
          <Route path="/tiles" element={<TilesPage />} />
          <Route path="/tiles-bundle" element={<TilesBundlePage />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/boards" element={<BoardsPage />} />
          <Route path="/offer" element={<OfferPage />} />
          <Route path="/offer2" element={<Offer2Page />} />
          <Route path="/order" element={<OrderReviewPage />} />
          <Route path="/reveal" element={<Reveal />} />
          <Route path="/photobook" element={<PhotobookPage />} />
          <Route path="/vip_portal" element={<VIPPortal />} />
          <Route path="/cms" element={<CMSPage />} />
          <Route path="/test" element={<TestPage />} />
          <Route path="/lptemp" element={<Lptemp />} />
          <Route path="/start" element={<Start />} />
          <Route path="/humans" element={<Start />} />
          <Route path="/memorial" element={<Memorial />} />
          <Route path="/masterpiece" element={<Masterpiece />} />
          <Route path="/masterpiece/:slug" element={<Masterpiece />} />
          <Route path="/photo-tiles" element={<PhotoTiles />} />
          <Route path="/photo-books" element={<PhotoAlbum />} />
          <Route path="/theme" element={<Theme />} />
          <Route path="/confirm" element={<Confirm />} />
          <Route path="/generating" element={<Generating />} />
          <Route path="/select-faces" element={<SelectFaces />} />
          <Route path="/faceswap" element={<FaceswapLanding />} />
          <Route path="/faceswap/upload" element={<FaceswapUpload />} />
          <Route path="/faceswap/review" element={<FaceswapReview />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/data-deletion" element={<DataDeletion />} />
          <Route path="/faq" element={<Faq />} />
          <Route path="/redeem" element={<Redeem />} />
          <Route path="/redeem/:orderId" element={<Redeem />} />
          <Route path="/about" element={<About />} />

          {/* Language-prefixed funnel routes (Phase 1) */}
          {SUPPORTED_LANGS.flatMap((lang) =>
            LOCALIZED_ROUTES.map((r) => (
              <Route
                key={`${lang}${r.path}`}
                path={`/${lang}${r.path}`}
                element={r.element}
              />
            )),
          )}

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  );
};

export default App;
