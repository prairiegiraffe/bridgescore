import { useEffect } from 'react';
import { useBranding } from '../contexts/BrandingContext';

// Component to update the browser tab title with the app name from branding
export default function TitleUpdater() {
  const { branding, loading } = useBranding();

  useEffect(() => {
    if (!loading && branding.app_name) {
      document.title = branding.app_name;
      console.log('Updated browser tab title to:', branding.app_name);
    }
  }, [branding.app_name, loading]);

  // This component doesn't render anything visible
  return null;
}