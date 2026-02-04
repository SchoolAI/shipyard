/*
 * Re-export properly typed Avatar components from HeroUI
 * HeroUI v3 exports Avatar as a compound component with Avatar.Image and Avatar.Fallback
 * These are properly typed - no type assertions needed
 */

export type { AvatarProps } from '@heroui/react';
export { Avatar } from '@heroui/react';
