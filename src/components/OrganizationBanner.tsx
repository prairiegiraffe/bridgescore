import { useState, useEffect } from 'react';
import { useOrg } from '../contexts/OrgContext';
import { supabase } from '../lib/supabase';

interface OrganizationBannerProps {
  className?: string;
}

export default function OrganizationBanner({ className = '' }: OrganizationBannerProps) {
  const { currentOrg } = useOrg();
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBannerUrl = async () => {
      if (!currentOrg) {
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('organizations')
          .select('banner_image_url')
          .eq('id', currentOrg.id)
          .single();

        if (error) {
          console.error('Error fetching banner URL:', error);
          setBannerUrl(null);
        } else {
          setBannerUrl(data?.banner_image_url || null);
        }
      } catch (err) {
        console.error('Error fetching banner URL:', err);
        setBannerUrl(null);
      } finally {
        setLoading(false);
      }
    };

    fetchBannerUrl();
  }, [currentOrg]);

  // Don't render anything while loading or if no banner URL
  if (loading || !bannerUrl) {
    return null;
  }

  return (
    <div className={`w-full ${className}`}>
      <img
        src={bannerUrl}
        alt={`${currentOrg?.name} banner`}
        className="w-full h-32 md:h-40 lg:h-48 object-cover"
        onError={(e) => {
          // Hide the banner if the image fails to load
          const target = e.target as HTMLElement;
          target.style.display = 'none';
        }}
      />
    </div>
  );
}