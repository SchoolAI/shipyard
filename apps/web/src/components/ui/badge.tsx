import { Chip, type ChipProps } from '@heroui/react';

import { cn } from '@/lib/utils';

// Re-export Chip directly for new code
export { Chip };

// Variant mapping from old Badge variants to HeroUI Chip props
type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

interface BadgeProps extends Omit<ChipProps, 'variant' | 'color'> {
  variant?: BadgeVariant;
  className?: string;
}

/**
 * Badge component - wrapper around HeroUI Chip for backward compatibility.
 *
 * Variant mapping:
 * - default → color="accent" variant="primary"
 * - secondary → color="default" variant="secondary"
 * - destructive → color="danger" variant="primary"
 * - outline → variant="tertiary"
 */
export function Badge({ variant = 'default', className, ...props }: BadgeProps) {
  // Map old variant names to HeroUI Chip color and variant props
  const chipProps: Partial<ChipProps> = (() => {
    switch (variant) {
      case 'default':
        return { color: 'accent' as const, variant: 'primary' as const };
      case 'secondary':
        return { color: 'default' as const, variant: 'secondary' as const };
      case 'destructive':
        return { color: 'danger' as const, variant: 'primary' as const };
      case 'outline':
        return { variant: 'tertiary' as const };
      default:
        return { color: 'accent' as const, variant: 'primary' as const };
    }
  })();

  return <Chip data-slot="badge" className={cn(className)} size="sm" {...chipProps} {...props} />;
}

// For code that imported badgeVariants for use elsewhere
// This is a stub that returns empty string - consumers should migrate to Chip
export const badgeVariants = () => '';
