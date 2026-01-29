/**
 * Modal for starting an agent (Claude Code).
 * MVP: Only supports Claude Code - agent selection will be added in future.
 */

import { Button, Card, Label, Modal, TextArea, TextField } from '@heroui/react';
import type React from 'react';
import { useState } from 'react';
import { useDaemon } from '@/hooks/useDaemon';

interface StartAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Modal for configuring and starting an agent.
 * Currently hardcoded to Claude Code only.
 *
 * Spawning differs per agent (claude -p vs codex exec).
 * Starting with Claude Code, will expand based on demand.
 */
export function StartAgentModal({ isOpen, onClose }: StartAgentModalProps) {
  const [prompt, setPrompt] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { startAgent, connected } = useDaemon();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isSubmitting || !connected) return;

    setIsSubmitting(true);
    try {
      const taskId = `task-${Date.now()}`;

      startAgent(taskId, prompt.trim());

      setPrompt('');
      onClose();
    } catch {
      /** Error is silently ignored - daemon will report via WebSocket */
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setPrompt('');
    onClose();
  };

  return (
    <Modal.Backdrop
      isOpen={isOpen}
      onOpenChange={(open) => !open && handleCancel()}
      isDismissable={!isSubmitting}
      isKeyboardDismissDisabled={isSubmitting}
    >
      <Modal.Container placement="center" size="md">
        <Modal.Dialog>
          <Modal.CloseTrigger />

          <Card>
            <Card.Header>
              <h2 className="text-xl font-semibold">Start Agent</h2>
            </Card.Header>

            <Card.Content>
              <form onSubmit={handleSubmit} className="space-y-4">
                <TextField isRequired isDisabled={isSubmitting}>
                  <Label>Task prompt</Label>
                  <TextArea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Describe what you want the agent to do..."
                    autoFocus
                    minLength={5}
                    rows={4}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Claude Code will work on this task autonomously.
                  </p>
                </TextField>

                {!connected && (
                  <div className="px-3 py-2 rounded-lg bg-danger/10 border border-danger/20">
                    <p className="text-sm text-danger">
                      Daemon not connected. Please ensure the daemon is running.
                    </p>
                  </div>
                )}

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
                    isDisabled={isSubmitting || !prompt.trim() || !connected}
                    isPending={isSubmitting}
                    variant="primary"
                  >
                    Start Agent
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
