import { Card } from '@heroui/react';
import type * as React from 'react';

import { cn } from '@/lib/utils';

// Re-export HeroUI Card
export { Card };

// Aliases for backward compatibility during migration
// These map to the compound component pattern
export const CardHeader = Card.Header;
export const CardTitle = Card.Title;
export const CardDescription = Card.Description;
export const CardContent = Card.Content;
export const CardFooter = Card.Footer;

// CardAction doesn't have a direct equivalent in HeroUI - keep it as a styled div
export function CardAction({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-action"
      className={cn('col-start-2 row-span-2 row-start-1 self-start justify-self-end', className)}
      {...props}
    />
  );
}
