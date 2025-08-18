import { useOrg } from '../contexts/OrgContext';

interface OrganizationBannerProps {
  className?: string;
}

export default function OrganizationBanner({ className = '' }: OrganizationBannerProps) {
  const { currentOrg } = useOrg();

  // Don't render anything if no organization or no banner image
  if (!currentOrg?.banner_image_url) {
    return null;
  }

  return (
    <div className={`w-full ${className}`}>
      <img
        src={currentOrg.banner_image_url}
        alt={`${currentOrg.name} banner`}
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