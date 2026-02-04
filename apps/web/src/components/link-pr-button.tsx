/**
 * Button to manually link a GitHub PR to the current task.
 *
 * Opens a popover with PR number input and optional repo override.
 * Can be controlled externally via isOpen/onOpenChange props.
 */

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
import type { TaskId } from '@shipyard/loro-schema';
import { GitPullRequest } from 'lucide-react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { useGitHubAuth } from '@/hooks/use-github-auth';
import { useTaskMeta } from '@/loro/selectors/task-selectors';
import { useTaskDocument } from '@/loro/use-task-document';

type PRStatus = 'merged' | 'closed' | 'draft' | 'open';

interface GitHubPR {
  merged: boolean;
  state: string;
  draft: boolean;
  head: { ref: string };
  title: string;
}

function determinePRStatus(pr: GitHubPR): PRStatus {
  if (pr.merged) return 'merged';
  if (pr.state === 'closed') return 'closed';
  if (pr.draft) return 'draft';
  return 'open';
}

async function fetchPRFromGitHub(repo: string, prNumber: number, token: string): Promise<GitHubPR> {
  const response = await fetch(`https://api.github.com/repos/${repo}/pulls/${prNumber}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`PR #${prNumber} not found in ${repo}`);
    }
    throw new Error(`GitHub API error: ${response.statusText}`);
  }

  return response.json();
}

interface LinkPRButtonProps {
  taskId: TaskId;
  className?: string;
  /** Controlled open state (optional) */
  isOpen?: boolean;
  /** Controlled open state change handler (optional) */
  onOpenChange?: (isOpen: boolean) => void;
}

/**
 * Button to manually link a GitHub PR to the current task.
 * Opens a popover with PR number input and optional repo override.
 * Can be controlled externally via isOpen/onOpenChange props.
 */
export function LinkPRButton({
  taskId,
  className,
  isOpen: controlledIsOpen,
  onOpenChange,
}: LinkPRButtonProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [prNumber, setPrNumber] = useState<number | undefined>(undefined);
  const [repo, setRepo] = useState('');
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { identity, startAuth } = useGitHubAuth();
  const taskDoc = useTaskDocument(taskId);
  const meta = useTaskMeta(taskId);

  /** Use controlled state if provided, otherwise use internal state */
  const isOpen = controlledIsOpen ?? internalIsOpen;
  const setIsOpen = onOpenChange ?? setInternalIsOpen;

  const isInvalid = prNumber !== undefined && prNumber < 1;

  const validateAndGetRepo = useCallback((): string | null => {
    if (!prNumber || prNumber < 1) {
      toast.error('Please enter a valid PR number');
      return null;
    }

    if (!identity?.token) {
      toast.info('Sign in with GitHub to link PRs');
      startAuth();
      return null;
    }

    const targetRepo = repo.trim() || meta?.repo;
    if (!targetRepo) {
      toast.error('No repository specified. Set repo in Advanced or add to task metadata.');
      return null;
    }

    return targetRepo;
  }, [prNumber, identity?.token, repo, meta?.repo, startAuth]);

  const linkPRToTask = useCallback(
    (pr: GitHubPR, prNum: number) => {
      const status = determinePRStatus(pr);

      taskDoc.linkedPRs.push({
        prNumber: prNum,
        status,
        branch: pr.head.ref ?? null,
        title: pr.title ?? null,
      });

      const actor = meta?.ownerId || 'unknown';
      taskDoc.logEvent('pr_linked', actor, {
        prNumber: prNum,
        title: pr.title ?? null,
      });
    },
    [taskDoc, meta?.ownerId]
  );

  const resetFormState = useCallback(() => {
    setIsOpen(false);
    setPrNumber(undefined);
    setRepo('');
    setIsAdvancedOpen(false);
  }, [setIsOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const targetRepo = validateAndGetRepo();
    if (!targetRepo || !prNumber || !identity?.token) return;

    setIsSubmitting(true);

    try {
      const pr = await fetchPRFromGitHub(targetRepo, prNumber, identity.token);
      linkPRToTask(pr, prNumber);
      toast.success(`PR #${prNumber} linked successfully!`);
      resetFormState();
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
        className={`${className ?? ''} touch-target`}
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
                    <Input placeholder={meta?.repo || 'owner/repo'} />
                    <Description>
                      Override repository (default: {meta?.repo || 'none set'})
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
