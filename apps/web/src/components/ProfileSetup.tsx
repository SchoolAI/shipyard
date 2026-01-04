import { useState } from 'react';
import { useIdentity } from '@/hooks/useIdentity';

interface ProfileSetupProps {
  /** Called when profile setup is complete */
  onComplete: () => void;
  /** Called when user cancels (optional) */
  onCancel?: () => void;
  /** Whether this is the initial setup or editing */
  isEditing?: boolean;
}

/**
 * Modal for setting up or editing user profile.
 *
 * On first use, prompts for display name before allowing comments.
 * Can also be used to edit existing profile.
 */
export function ProfileSetup({ onComplete, onCancel, isEditing = false }: ProfileSetupProps) {
  const { identity, create, updateName } = useIdentity();
  const [displayName, setDisplayName] = useState(identity?.displayName ?? '');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const trimmed = displayName.trim();
    if (!trimmed) {
      setError('Please enter a display name');
      return;
    }

    if (trimmed.length < 2) {
      setError('Name must be at least 2 characters');
      return;
    }

    if (trimmed.length > 50) {
      setError('Name must be 50 characters or less');
      return;
    }

    if (isEditing && identity) {
      updateName(trimmed);
    } else {
      create(trimmed);
    }

    onComplete();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {isEditing ? 'Edit Profile' : 'Set Up Your Profile'}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {isEditing
              ? 'Update your display name for comments'
              : 'Enter a name to identify yourself in comments'}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="px-6 py-4">
            <label htmlFor="displayName" className="block text-sm font-medium text-gray-700 mb-2">
              Display Name
            </label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                setError(null);
              }}
              placeholder="Enter your name..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              maxLength={50}
            />
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

            {identity && (
              <div className="mt-4 flex items-center gap-2">
                <div
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: identity.color }}
                  title="Your color"
                />
                <span className="text-sm text-gray-500">Your color for comments</span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              {isEditing ? 'Save Changes' : 'Continue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
