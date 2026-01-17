import {
  Button,
  Description,
  Disclosure,
  FieldError,
  Form,
  Input,
  Label,
  NumberField,
  Popover,
  Spinner,
  TextField,
} from '@heroui/react';
import { getPlanMetadata, type LinkedPR, linkPR, logPlanEvent } from '@peer-plan/schema';
import { GitPullRequest } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type * as Y from 'yjs';
import { useUserIdentity } from '@/contexts/UserIdentityContext';
import { useGitHubAuth } from '@/hooks/useGitHubAuth';

interface LinkPRButtonProps {
  ydoc: Y.Doc;
  className?: string;
  /** Controlled open state (optional) */
  isOpen?: boolean;
  /** Controlled open state change handler (optional) */
  onOpenChange?: (isOpen: boolean) => void;
}

/**
 * Button to manually link a GitHub PR to the current plan.
 * Opens a popover with PR number input and optional repo override.
 * Can be controlled externally via isOpen/onOpenChange props.
 */
export function LinkPRButton({
  ydoc,
  className,
  isOpen: controlledIsOpen,
  onOpenChange,
}: LinkPRButtonProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [prNumber, setPrNumber] = useState<number | undefined>(undefined);
  const [repo, setRepo] = useState('');
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { identity } = useGitHubAuth();
  const { actor } = useUserIdentity();

  // Use controlled state if provided, otherwise use internal state
  const isOpen = controlledIsOpen ?? internalIsOpen;
  const setIsOpen = onOpenChange ?? setInternalIsOpen;

  const metadata = getPlanMetadata(ydoc);
  const isInvalid = prNumber !== undefined && prNumber < 1;

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Form submission requires validation, API call, error handling, state updates
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!prNumber || prNumber < 1) {
      toast.error('Please enter a valid PR number');
      return;
    }

    if (!identity?.token) {
      toast.error('Please sign in with GitHub to link PRs');
      return;
    }

    const targetRepo = repo.trim() || metadata?.repo;
    if (!targetRepo) {
      toast.error('No repository specified. Set repo in Advanced or add to plan metadata.');
      return;
    }

    setIsSubmitting(true);

    try {
      // Fetch PR details from GitHub API
      const response = await fetch(`https://api.github.com/repos/${targetRepo}/pulls/${prNumber}`, {
        headers: {
          Authorization: `Bearer ${identity.token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`PR #${prNumber} not found in ${targetRepo}`);
        }
        throw new Error(`GitHub API error: ${response.statusText}`);
      }

      const pr = await response.json();

      // Create LinkedPR object
      const linkedPR: LinkedPR = {
        prNumber,
        url: pr.html_url,
        linkedAt: Date.now(),
        status: pr.merged
          ? 'merged'
          : pr.state === 'closed'
            ? 'closed'
            : pr.draft
              ? 'draft'
              : 'open',
        branch: pr.head.ref,
        title: pr.title,
      };

      // Store in Y.Doc
      linkPR(ydoc, linkedPR);

      // Log PR linked event
      logPlanEvent(ydoc, 'pr_linked', actor, {
        prNumber,
        url: linkedPR.url,
      });

      toast.success(`PR #${prNumber} linked successfully!`);
      setIsOpen(false);
      setPrNumber(undefined);
      setRepo('');
      setIsAdvancedOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to link PR';
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Popover isOpen={isOpen} onOpenChange={setIsOpen}>
      <Button
        isIconOnly
        variant="ghost"
        size="sm"
        className={`${className} touch-target`}
        aria-label="Link a pull request"
      >
        <GitPullRequest className="w-4 h-4" />
      </Button>

      <Popover.Content className="max-w-md" placement="bottom">
        <Popover.Dialog>
          <Popover.Arrow />
          <Popover.Heading>Link Pull Request</Popover.Heading>

          <Form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <NumberField
              isRequired
              isInvalid={isInvalid}
              minValue={1}
              value={prNumber}
              onChange={setPrNumber}
              name="prNumber"
              autoFocus
            >
              <Label>PR Number</Label>
              <NumberField.Group>
                <NumberField.DecrementButton />
                <NumberField.Input className="w-full" placeholder="123" />
                <NumberField.IncrementButton />
              </NumberField.Group>
              {isInvalid ? (
                <FieldError>PR number must be positive</FieldError>
              ) : (
                <Description>Enter the GitHub pull request number</Description>
              )}
            </NumberField>

            <Disclosure isExpanded={isAdvancedOpen} onExpandedChange={setIsAdvancedOpen}>
              <Disclosure.Heading>
                <Button slot="trigger" variant="secondary" size="sm" className="w-full">
                  Advanced Options
                  <Disclosure.Indicator />
                </Button>
              </Disclosure.Heading>
              <Disclosure.Content>
                <Disclosure.Body>
                  <TextField value={repo} onChange={setRepo} name="repo">
                    <Label>Repository</Label>
                    <Input placeholder={metadata?.repo || 'owner/repo'} />
                    <Description>
                      Override repository (default: {metadata?.repo || 'none set'})
                    </Description>
                  </TextField>
                </Disclosure.Body>
              </Disclosure.Content>
            </Disclosure>

            <div className="flex gap-2 justify-end">
              <Button
                variant="secondary"
                onPress={() => setIsOpen(false)}
                isDisabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                isDisabled={!prNumber || prNumber < 1 || isSubmitting}
                isPending={isSubmitting}
              >
                {isSubmitting && <Spinner size="sm" />}
                Link PR
              </Button>
            </div>
          </Form>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
