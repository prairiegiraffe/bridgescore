import { useParams } from 'react-router-dom';

export default function Demo() {
  const { shareId } = useParams<{ shareId: string }>();

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">
        Demo - {shareId}
      </h1>
      <p className="text-gray-600">Demo content coming soon...</p>
    </div>
  );
}