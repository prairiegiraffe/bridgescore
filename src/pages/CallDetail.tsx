import { useParams } from 'react-router-dom';

export default function CallDetail() {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">
        Call Detail - {id}
      </h1>
      <p className="text-gray-600">Call detail content coming soon...</p>
    </div>
  );
}