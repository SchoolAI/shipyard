import {
  Button,
  Description,
  FieldError,
  Form,
  Input,
  Label,
  Modal,
  TextField,
} from '@heroui/react';
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

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen && onCancel) {
      onCancel();
    }
  };

  return (
    <Modal.Backdrop isOpen onOpenChange={handleOpenChange} isDismissable={!!onCancel}>
      <Modal.Container>
        <Modal.Dialog className="sm:max-w-md">
          {onCancel && <Modal.CloseTrigger />}
          <Modal.Header>
            <Modal.Heading>{isEditing ? 'Edit Profile' : 'Set Up Your Profile'}</Modal.Heading>
            <p className="text-sm text-muted mt-1">
              {isEditing
                ? 'Update your display name for comments'
                : 'Enter a name to identify yourself in comments'}
            </p>
          </Modal.Header>
          <Form onSubmit={handleSubmit}>
            <Modal.Body>
              <TextField
                name="displayName"
                isRequired
                isInvalid={!!error}
                value={displayName}
                onChange={(value) => {
                  setDisplayName(value);
                  setError(null);
                }}
                className="w-full"
              >
                <Label>Display Name</Label>
                <Input placeholder="Enter your name..." maxLength={50} />
                {error && <FieldError>{error}</FieldError>}
              </TextField>

              {identity && (
                <div className="mt-4 flex items-center gap-2">
                  <div
                    className="w-4 h-4 rounded-full"
                    style={{ backgroundColor: identity.color }}
                    title="Your color"
                  />
                  <Description>Your color for comments</Description>
                </div>
              )}
            </Modal.Body>
            <Modal.Footer>
              {onCancel && (
                <Button variant="secondary" slot="close">
                  Cancel
                </Button>
              )}
              <Button type="submit">{isEditing ? 'Save Changes' : 'Continue'}</Button>
            </Modal.Footer>
          </Form>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
