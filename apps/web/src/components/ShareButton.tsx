import { Button } from '@heroui/react';
import { Check, Share2 } from 'lucide-react';
import { useState } from 'react';

interface ShareButtonProps {
  className?: string;
}

/**
 * Button to copy the current plan URL to clipboard for P2P sharing.
 * The URL includes the plan ID which serves as the WebRTC room identifier.
 */
export function ShareButton({ className }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = window.location.href;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Icon-only for both mobile and desktop
  return (
    <Button
      isIconOnly
      variant="ghost"
      size="sm"
      onPress={handleShare}
      className={`${className} touch-target`}
      aria-label="Copy link to share with reviewers"
    >
      {copied ? <Check className="w-4 h-4 text-success" /> : <Share2 className="w-4 h-4" />}
    </Button>
  );
}
