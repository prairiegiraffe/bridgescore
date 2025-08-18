import { useOrg } from '../contexts/OrgContext';

interface OrganizationBannerProps {
  className?: string;
}

export default function OrganizationBanner({ className = '' }: OrganizationBannerProps) {
  const { currentOrg } = useOrg();

  // Get banner URL directly from currentOrg (which now includes banner_image_url)
  const bannerUrl = currentOrg?.banner_image_url;

  // Don't render anything if no current org or no banner URL
  if (!currentOrg || !bannerUrl) {
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