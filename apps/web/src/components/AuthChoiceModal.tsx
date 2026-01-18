import { Button, Card, Modal } from '@heroui/react';
import { Check, Github, X } from 'lucide-react';

interface AuthChoiceModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onGitHubAuth: () => void;
  onLocalAuth: () => void;
}

/**
 * Modal that presents the user with two authentication options:
 * - Sign in with GitHub (OAuth)
 * - Sign in locally (username only, no GitHub required)
 */
export function AuthChoiceModal({
  isOpen,
  onOpenChange,
  onGitHubAuth,
  onLocalAuth,
}: AuthChoiceModalProps) {
  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange} isDismissable>
      <Modal.Container placement="center" size="md">
        <Modal.Dialog className="sm:max-w-[800px]">
          <Modal.CloseTrigger />

          <Card>
            <Card.Header>
              <h2 className="text-xl font-semibold">Sign in to Peer-Plan</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Choose how you'd like to identify yourself in this workspace.
              </p>
            </Card.Header>

            <Card.Content className="pt-0">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* GitHub Account Option */}
                <Card
                  variant="transparent"
                  className="border border-separator flex flex-col gap-0 p-4"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Github className="w-5 h-5" />
                    <h3 className="font-semibold">GitHub Account</h3>
                  </div>
                  <p className="text-sm text-muted mb-2">
                    Full-featured access with verified identity
                  </p>
                  <div className="text-sm space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-success shrink-0" />
                      <span>Upload artifacts to private repos</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-success shrink-0" />
                      <span>Verified identity with avatar</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-success shrink-0" />
                      <span>Share plans with remote teams</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-success shrink-0" />
                      <span>Access private plans</span>
                    </div>
                  </div>
                  <Button
                    variant="primary"
                    onPress={() => {
                      onGitHubAuth();
                      onOpenChange(false);
                    }}
                    className="w-full mt-3"
                  >
                    Sign in with GitHub
                  </Button>
                </Card>

                {/* Local Username Option */}
                <Card
                  variant="transparent"
                  className="border border-separator flex flex-col gap-0 p-4"
                >
                  <h3 className="font-semibold mb-2">Local Username</h3>
                  <p className="text-sm text-muted mb-2">Work locally without GitHub account</p>
                  <div className="text-sm space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-success shrink-0" />
                      <span>View and edit plans locally</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-success shrink-0" />
                      <span>Add comments and participate</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <X className="w-4 h-4 text-danger shrink-0" />
                      <span>Artifacts only on this machine</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <X className="w-4 h-4 text-danger shrink-0" />
                      <span>No remote sharing (requires GitHub)</span>
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    onPress={() => {
                      onLocalAuth();
                      onOpenChange(false);
                    }}
                    className="w-full mt-3"
                  >
                    Sign in locally
                  </Button>
                </Card>
              </div>
            </Card.Content>
          </Card>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
