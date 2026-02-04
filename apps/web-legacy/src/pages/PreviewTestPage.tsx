/**
 * Preview Test Page - Developer tool to test social preview functionality.
 * Shows how snapshot URLs will appear when shared on different platforms.
 */

import {
  Button,
  Card,
  Chip,
  Input,
  Label,
  Skeleton,
  Spinner,
  Surface,
  TextField,
  Tooltip,
} from '@heroui/react';
import { decodePlan, type PlanStatusType, type UrlEncodedPlan } from '@shipyard/schema';
import {
  Check,
  Circle,
  CircleDot,
  ClipboardCopy,
  Clock,
  ExternalLink,
  Globe,
  Image,
  ImageOff,
  MessageSquare,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

/** Production OG proxy URL */
const OG_PROXY_WORKER_URL_PROD = 'https://shipyard-og-proxy.jacob-191.workers.dev';

/**
 * Worker URL for the OG proxy.
 *
 * Uses Vite MODE-based defaults:
 * - development: http://localhost:{og proxy port from env or 4446}
 * - production: https://shipyard-og-proxy.jacob-191.workers.dev
 *
 * Can be overridden with VITE_OG_PROXY_URL environment variable.
 * In worktrees, this is set by worktree-env.sh to avoid port conflicts.
 */
const OG_PROXY_WORKER_URL = (() => {
  if (import.meta.env.VITE_OG_PROXY_URL) {
    return import.meta.env.VITE_OG_PROXY_URL;
  }
  if (import.meta.env.DEV) {
    return 'http://localhost:4446';
  }
  return OG_PROXY_WORKER_URL_PROD;
})();

interface CopyButtonProps {
  text: string;
  label: string;
}

/** Button that copies text to clipboard with feedback */
function CopyButton({ text, label }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }, [text]);

  return (
    <Tooltip>
      <Tooltip.Trigger>
        <Button variant="secondary" size="sm" onPress={handleCopy} className="gap-2">
          {copied ? (
            <Check className="w-4 h-4 text-success" />
          ) : (
            <ClipboardCopy className="w-4 h-4" />
          )}
          {label}
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Content>{copied ? 'Copied!' : 'Copy to clipboard'}</Tooltip.Content>
    </Tooltip>
  );
}

interface OGPreviewCardProps {
  plan: UrlEncodedPlan;
  workerUrl: string;
}

/** Status configuration for styling - mirrors StatusChip.tsx patterns */
interface StatusConfig {
  color: 'default' | 'accent' | 'success' | 'warning' | 'danger';
  icon: typeof Circle;
  label: string;
}

const statusConfig: Record<PlanStatusType, StatusConfig> = {
  draft: { color: 'default', icon: Circle, label: 'Draft' },
  pending_review: { color: 'warning', icon: Clock, label: 'Pending Review' },
  changes_requested: { color: 'danger', icon: X, label: 'Changes Requested' },
  in_progress: { color: 'accent', icon: CircleDot, label: 'In Progress' },
  completed: { color: 'success', icon: Check, label: 'Completed' },
};

/** Image loading states for the OG preview */
type ImageState = 'loading' | 'loaded' | 'error';

/** Simulates how the link preview looks on GitHub/Discord - polished card design */
function OGPreviewCard({ plan, workerUrl }: OGPreviewCardProps) {
  const [imageState, setImageState] = useState<ImageState>('loading');

  const ogImageUrl = useMemo(() => {
    try {
      const urlObj = new URL(workerUrl);
      const dataParam = urlObj.searchParams.get('d');
      if (dataParam) {
        return `${OG_PROXY_WORKER_URL}/og-image?d=${dataParam}`;
      }
    } catch {}
    return `${OG_PROXY_WORKER_URL}/og-image.png`;
  }, [workerUrl]);

  const deliverableCount = plan.deliverables?.length ?? 0;
  /** A deliverable is considered "fulfilled" when it has a linked artifact */
  const completedCount = plan.deliverables?.filter((d) => d.linkedArtifactId).length ?? 0;

  const statusInfo = statusConfig[plan.status] ?? statusConfig.draft;
  const StatusIcon = statusInfo.icon;

  const description = useMemo(() => {
    const parts: string[] = [];
    if (deliverableCount > 0) {
      parts.push(`${completedCount}/${deliverableCount} deliverables`);
    }
    if (plan.repo) {
      parts.push(plan.repo);
    }
    return parts.length > 0 ? parts.join(' • ') : 'No deliverables yet';
  }, [plan.repo, deliverableCount, completedCount]);

  const hostname = useMemo(() => {
    try {
      return new URL(workerUrl).hostname;
    } catch {
      return 'shipyard.app';
    }
  }, [workerUrl]);

  return (
    <Card
      variant="secondary"
      className="overflow-hidden max-w-md border border-muted/30 shadow-md hover:shadow-lg transition-shadow duration-200 rounded-xl"
    >
      {/* Image section - OG images are typically 1200x630 (1.9:1 aspect ratio) */}
      <div className="relative bg-muted/20" style={{ aspectRatio: '1200/630' }}>
        {/* Loading skeleton */}
        {imageState === 'loading' && (
          <Skeleton
            className="absolute inset-0 w-full h-full rounded-none"
            animationType="shimmer"
          />
        )}

        {/* Error state */}
        {imageState === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted/10">
            <ImageOff className="w-10 h-10 text-muted-foreground/40" />
            <span className="text-xs text-muted-foreground/60 mt-2">Image unavailable</span>
          </div>
        )}

        {/* Actual image */}
        {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: onLoad/onError are for load state, not user interaction */}
        <img
          src={ogImageUrl}
          alt="Shipyard Plan Preview"
          className={`w-full h-full object-cover transition-opacity duration-300 ${
            imageState === 'loaded' ? 'opacity-100' : 'opacity-0'
          }`}
          onLoad={() => setImageState('loaded')}
          onError={() => setImageState('error')}
        />
      </div>

      {/* Content section */}
      <Card.Content className="p-4 space-y-3">
        {/* Title - link style like GitHub */}
        <Card.Title className="text-lg font-semibold text-accent hover:text-accent/80 line-clamp-2 cursor-pointer transition-colors">
          {plan.title || 'Untitled Plan'}
        </Card.Title>

        {/* Description - muted, smaller */}
        <Card.Description className="text-sm text-muted-foreground line-clamp-2">
          {description}
        </Card.Description>

        {/* Status chip - color-coded */}
        <div className="flex items-center gap-2">
          <Chip color={statusInfo.color} variant="soft" size="sm">
            <StatusIcon className="w-3 h-3" />
            {statusInfo.label}
          </Chip>
          {deliverableCount > 0 && completedCount === deliverableCount && (
            <Chip color="success" variant="soft" size="sm">
              <Check className="w-3 h-3" />
              All Complete
            </Chip>
          )}
        </div>
      </Card.Content>

      {/* Footer with domain - very muted */}
      <Card.Footer className="px-4 pb-4 pt-0">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground/60">
          <Globe className="w-3 h-3" />
          <span className="truncate">{hostname}</span>
        </div>
      </Card.Footer>
    </Card>
  );
}

interface EmbedPreviewProps {
  workerUrl: string;
}

/** Shows the actual iframe embed that Slack/Teams would render */
function EmbedPreview({ workerUrl }: EmbedPreviewProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const embedUrl = useMemo(() => {
    try {
      const url = new URL(workerUrl);
      const dParam = url.searchParams.get('d');
      if (!dParam) return workerUrl;

      const embedUrl = new URL(OG_PROXY_WORKER_URL);
      embedUrl.pathname = '/embed';
      embedUrl.searchParams.set('d', dParam);
      return embedUrl.toString();
    } catch {
      return workerUrl;
    }
  }, [workerUrl]);

  return (
    <div className="border border-separator rounded-lg overflow-hidden bg-surface">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-separator bg-surface-secondary">
        <span className="text-xs text-muted-foreground font-medium">iframe (600 x 400)</span>
        <a
          href={embedUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary hover:text-primary/80 flex items-center gap-1"
        >
          Open <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {/* Iframe container */}
      <div className="relative" style={{ height: '400px' }}>
        {isLoading && !hasError && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface">
            <div className="flex flex-col items-center gap-2">
              <Spinner size="md" />
              <span className="text-sm text-muted-foreground">Loading embed...</span>
            </div>
          </div>
        )}

        {hasError && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface">
            <div className="text-center p-4">
              <p className="text-sm text-muted-foreground">Failed to load embed</p>
              <p className="text-xs text-muted-foreground mt-1">
                The worker may not be deployed yet
              </p>
            </div>
          </div>
        )}

        {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: onLoad/onError are for load state, not user interaction */}
        <iframe
          src={embedUrl}
          title="Shipyard Plan Embed Preview"
          width="600"
          height="400"
          className={`w-full ${isLoading && !hasError ? 'invisible' : ''}`}
          style={{ border: 'none', maxWidth: '100%' }}
          onLoad={() => setIsLoading(false)}
          onError={() => {
            setIsLoading(false);
            setHasError(true);
          }}
          sandbox="allow-scripts allow-same-origin"
        />
      </div>
    </div>
  );
}

/** Generates the oEmbed JSON response for debugging */
function generateOEmbedJSON(plan: UrlEncodedPlan, workerUrl: string): object {
  const embedUrl = `${workerUrl}?embed=true`;

  return {
    version: '1.0',
    type: 'rich',
    title: plan.title || 'Shipyard Plan',
    provider_name: 'Shipyard',
    provider_url: 'https://schoolai.github.io/shipyard',
    html: `<iframe src="${embedUrl}" width="600" height="400" frameborder="0" allowfullscreen></iframe>`,
    width: 600,
    height: 400,
  };
}

export function PreviewTestPage() {
  const [searchParams] = useSearchParams();
  const [inputUrl, setInputUrl] = useState('');
  const [decodedPlan, setDecodedPlan] = useState<UrlEncodedPlan | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Extract plan from URL and decode it */
  const extractAndDecodePlan = useCallback((url: string) => {
    setError(null);
    setDecodedPlan(null);

    if (!url.trim()) {
      return;
    }

    try {
      const urlObj = new URL(url);
      const dataParam = urlObj.searchParams.get('d');

      if (!dataParam) {
        setError('No ?d= parameter found in URL');
        return;
      }

      const plan = decodePlan(dataParam);
      if (!plan) {
        setError('Failed to decode plan data - URL may be corrupted');
        return;
      }

      setDecodedPlan(plan);
    } catch {
      setError('Invalid URL format');
    }
  }, []);

  /** Use current plan from URL if available */
  const useCurrentPlan = useCallback(() => {
    const dataParam = searchParams.get('d');
    if (dataParam) {
      const plan = decodePlan(dataParam);
      if (plan) {
        setDecodedPlan(plan);
        setInputUrl(window.location.href);
        setError(null);
      } else {
        setError('Failed to decode current plan data');
      }
    } else {
      setError('No plan found in current URL');
    }
  }, [searchParams]);

  /** Handle input changes */
  const handleInputChange = useCallback((value: string) => {
    setInputUrl(value);
  }, []);

  /** Handle form submission */
  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      extractAndDecodePlan(inputUrl);
    },
    [inputUrl, extractAndDecodePlan]
  );

  /** Generate worker URL for the plan */
  const workerUrl = useMemo(() => {
    if (!decodedPlan || !inputUrl) return '';

    try {
      const urlObj = new URL(inputUrl);
      const dataParam = urlObj.searchParams.get('d');
      if (dataParam) {
        return `${OG_PROXY_WORKER_URL}?d=${dataParam}`;
      }
    } catch {}

    return '';
  }, [decodedPlan, inputUrl]);

  /** oEmbed JSON for copying */
  const oEmbedJSON = useMemo(() => {
    if (!decodedPlan || !workerUrl) return '';
    return JSON.stringify(generateOEmbedJSON(decodedPlan, workerUrl), null, 2);
  }, [decodedPlan, workerUrl]);

  /** Check for URL param on load */
  useEffect(() => {
    const testUrl = searchParams.get('testUrl');
    if (testUrl) {
      setInputUrl(testUrl);
      extractAndDecodePlan(testUrl);
    }
  }, [searchParams, extractAndDecodePlan]);

  return (
    <div className="min-h-full p-4 md:p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground mb-2">Preview Test Tool</h1>
          <p className="text-muted-foreground">
            Test how your snapshot URLs will appear when shared on different platforms.
          </p>
        </div>

        {/* Input section */}
        <Surface variant="secondary" className="rounded-xl p-4 mb-6">
          <form onSubmit={handleSubmit}>
            <div className="flex flex-col sm:flex-row gap-3">
              <TextField className="flex-1" name="snapshotUrl">
                <Label className="sr-only">Snapshot URL</Label>
                <Input
                  placeholder="Paste a snapshot URL with ?d= parameter..."
                  value={inputUrl}
                  onChange={(e) => handleInputChange(e.target.value)}
                  className="w-full"
                />
              </TextField>

              <div className="flex gap-2 shrink-0">
                <Button type="submit" variant="primary">
                  Preview
                </Button>
                <Tooltip>
                  <Tooltip.Trigger>
                    <Button type="button" variant="secondary" onPress={useCurrentPlan}>
                      Use Current URL
                    </Button>
                  </Tooltip.Trigger>
                  <Tooltip.Content>Use the ?d= parameter from the current page URL</Tooltip.Content>
                </Tooltip>
              </div>
            </div>
          </form>

          {error && <p className="text-sm text-danger mt-3">{error}</p>}
        </Surface>

        {/* Preview panels */}
        {decodedPlan && workerUrl && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: OG Preview */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Image className="w-5 h-5 text-muted-foreground" />
                <h2 className="text-lg font-semibold text-foreground">GitHub / Discord Preview</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                How the link preview card appears when sharing the URL
              </p>

              <OGPreviewCard plan={decodedPlan} workerUrl={workerUrl} />

              <CopyButton text={workerUrl} label="Copy Worker URL" />
            </div>

            {/* Right: Embed Preview */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-muted-foreground" />
                <h2 className="text-lg font-semibold text-foreground">Slack / Teams Embed</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                The iframe embed that rich-preview platforms will render
              </p>

              <EmbedPreview workerUrl={workerUrl} />

              <CopyButton text={oEmbedJSON} label="Copy oEmbed JSON" />
            </div>
          </div>
        )}

        {/* Plan metadata (collapsed by default) */}
        {decodedPlan && (
          <details className="mt-8">
            <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
              View decoded plan data
            </summary>
            <Surface variant="secondary" className="rounded-lg p-4 mt-2 overflow-auto">
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
                {JSON.stringify(decodedPlan, null, 2)}
              </pre>
            </Surface>
          </details>
        )}

        {/* Empty state */}
        {!decodedPlan && !error && (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-surface-secondary flex items-center justify-center">
              <Globe className="w-8 h-8 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-medium text-foreground mb-2">No preview yet</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Paste a snapshot URL above to see how it will appear when shared on GitHub, Discord,
              Slack, and Teams.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
