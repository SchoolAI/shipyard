import { Button, Card, Input, Label, Modal, TextField } from '@heroui/react';
import type React from 'react';
import { useState } from 'react';
import { toast } from 'sonner';

interface SignInModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSignIn: (username: string) => void;
}

/**
 * Local identity sign-in modal.
 * Allows users to set a username for local-only identity (no GitHub required).
 */
export function SignInModal({ isOpen, onClose, onSignIn }: SignInModalProps) {
  const [username, setUsername] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      onSignIn(username.trim());
      setUsername('');
      onClose();
    } catch (error) {
      // Show validation errors from useLocalIdentity hook
      if (error instanceof Error) {
        toast.error(error.message);
      } else {
        toast.error('Failed to set username');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setUsername('');
    onClose();
  };

  return (
    <Modal.Backdrop
      isOpen={isOpen}
      onOpenChange={(open) => !open && handleCancel()}
      isDismissable={!isSubmitting}
      isKeyboardDismissDisabled={isSubmitting}
    >
      <Modal.Container placement="center" size="sm">
        <Modal.Dialog>
          <Modal.CloseTrigger />

          <Card>
            <Card.Header>
              <h2 className="text-xl font-semibold">Choose a username</h2>
            </Card.Header>

            <Card.Content>
              <form onSubmit={handleSubmit} className="space-y-4">
                <TextField isRequired isDisabled={isSubmitting}>
                  <Label>Username</Label>
                  <Input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter your username"
                    autoFocus
                    minLength={2}
                    maxLength={39}
                    pattern="[a-zA-Z0-9-]+"
                    title="Username can only contain letters, numbers, and hyphens"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    This username will be used to identify you locally. Letters, numbers, and
                    hyphens only.
                  </p>
                </TextField>

                <div className="flex gap-2 justify-end pt-2">
                  <Button
                    variant="secondary"
                    onPress={handleCancel}
                    isDisabled={isSubmitting}
                    type="button"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    isDisabled={isSubmitting || !username.trim()}
                    isPending={isSubmitting}
                  >
                    Sign In
                  </Button>
                </div>
              </form>
            </Card.Content>
          </Card>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
