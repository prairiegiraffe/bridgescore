import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';

interface GlobalBranding {
  app_name: string;
  logo_url: string;
  favicon_url: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
}

interface BrandingContextType {
  branding: GlobalBranding;
  loading: boolean;
  refreshBranding: () => Promise<void>;
}

const defaultBranding: GlobalBranding = {
  app_name: 'BridgeScore',
  logo_url: '',
  favicon_url: '',
  primary_color: '#3B82F6',
  secondary_color: '#1E40AF',
  accent_color: '#10B981'
};

const BrandingContext = createContext<BrandingContextType | undefined>(undefined);

export const useBranding = () => {
  const context = useContext(BrandingContext);
  if (context === undefined) {
    throw new Error('useBranding must be used within a BrandingProvider');
  }
  return context;
};

interface BrandingProviderProps {
  children: ReactNode;
}

export const BrandingProvider: React.FC<BrandingProviderProps> = ({ children }) => {
  const [branding, setBranding] = useState<GlobalBranding>(defaultBranding);
  const [loading, setLoading] = useState(true);

  const updateFavicon = (faviconUrl: string) => {
    if (!faviconUrl) return;
    
    // Remove existing favicon links
    const existingFavicons = document.querySelectorAll("link[rel*='icon']");
    existingFavicons.forEach(favicon => favicon.remove());
    
    // Create new favicon link
    const link = document.createElement('link');
    link.rel = 'icon';
    link.href = faviconUrl;
    document.head.appendChild(link);
    
    // Also add apple-touch-icon for iOS devices
    const appleLink = document.createElement('link');
    appleLink.rel = 'apple-touch-icon';
    appleLink.href = faviconUrl;
    document.head.appendChild(appleLink);
  };

  const fetchBranding = async () => {
    try {
      const { data, error } = await (supabase as any).rpc('get_global_branding');
      
      if (error) {
        console.warn('Error fetching global branding, using defaults:', error);
        setBranding(defaultBranding);
      } else {
        const brandingData = data || defaultBranding;
        setBranding(brandingData);
        
        // Update favicon if available
        if (brandingData.favicon_url) {
          updateFavicon(brandingData.favicon_url);
        }
      }
    } catch (err) {
      console.warn('Error fetching global branding, using defaults:', err);
      setBranding(defaultBranding);
    } finally {
      setLoading(false);
    }
  };

  const refreshBranding = async () => {
    setLoading(true);
    await fetchBranding();
  };

  useEffect(() => {
    fetchBranding();
  }, []);

  const value: BrandingContextType = {
    branding,
    loading,
    refreshBranding
  };

  return (
    <BrandingContext.Provider value={value}>
      {children}
    </BrandingContext.Provider>
  );
};