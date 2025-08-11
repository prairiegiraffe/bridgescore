import { useState } from 'react';
import { useOrg } from '../contexts/OrgContext';

export default function OrgSwitcher() {
  const { organizations, currentOrg, setCurrentOrg, loading } = useOrg();
  const [isOpen, setIsOpen] = useState(false);

  if (loading || organizations.length === 0) {
    return null;
  }

  const handleOrgSelect = (org: typeof currentOrg) => {
    setCurrentOrg(org);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      >
        <span className="truncate max-w-32">
          {currentOrg?.name || 'Select Organization'}
        </span>
        <svg
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Dropdown */}
          <div className="absolute right-0 z-20 mt-2 w-56 origin-top-right bg-white border border-gray-200 rounded-md shadow-lg">
            <div className="py-1">
              {organizations.map((org) => (
                <button
                  key={org.id}
                  onClick={() => handleOrgSelect(org)}
                  className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center justify-between ${
                    currentOrg?.id === org.id ? 'bg-blue-50 text-blue-700' : 'text-gray-900'
                  }`}
                >
                  <div className="flex flex-col items-start">
                    <span className="font-medium">{org.name}</span>
                    <span className="text-xs text-gray-500 capitalize">
                      {org.role} {org.is_demo ? '(Demo)' : ''}
                    </span>
                  </div>
                  {currentOrg?.id === org.id && (
                    <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}