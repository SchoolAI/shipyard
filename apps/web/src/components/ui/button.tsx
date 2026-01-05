import { tv, type VariantProps } from 'tailwind-variants';

export type { ButtonProps } from '@heroui/react';
// Re-export HeroUI Button as the default
export { Button } from '@heroui/react';

/**
 * Backward-compatible buttonVariants for any code using the CVA pattern.
 * Maps old variant/size names to HeroUI v3 equivalents.
 *
 * Variant mapping:
 * - default -> primary
 * - destructive -> danger
 * - outline -> tertiary
 * - secondary -> secondary
 * - ghost -> ghost
 * - link -> ghost with underline styling
 *
 * Size mapping:
 * - default -> md
 * - sm -> sm
 * - lg -> lg
 * - icon/icon-sm/icon-lg -> use isIconOnly prop instead
 */
export const buttonVariants = tv({
  base: '', // HeroUI handles base styles
  variants: {
    variant: {
      // New HeroUI v3 variants
      primary: '',
      secondary: '',
      tertiary: '',
      ghost: '',
      danger: '',
      'danger-soft': '',
      // Legacy variant mappings (for backward compatibility)
      default: '', // maps to primary
      destructive: '', // maps to danger
      outline: '', // maps to tertiary
      link: 'underline-offset-4 hover:underline',
    },
    size: {
      // New HeroUI v3 sizes
      sm: '',
      md: '',
      lg: '',
      // Legacy size mappings
      default: '', // maps to md
      icon: '', // use isIconOnly prop with md size
      'icon-sm': '', // use isIconOnly prop with sm size
      'icon-lg': '', // use isIconOnly prop with lg size
    },
  },
  defaultVariants: {
    variant: 'primary',
    size: 'md',
  },
});

export type ButtonVariants = VariantProps<typeof buttonVariants>;

/**
 * Maps legacy variant names to HeroUI v3 variants.
 * Use this when migrating old code to new Button component.
 */
export const variantMap = {
  default: 'primary',
  primary: 'primary',
  destructive: 'danger',
  danger: 'danger',
  'danger-soft': 'danger-soft',
  outline: 'tertiary',
  tertiary: 'tertiary',
  secondary: 'secondary',
  ghost: 'ghost',
  link: 'ghost', // Use ghost + className for underline
} as const;

/**
 * Maps legacy size names to HeroUI v3 sizes.
 * Note: For icon-only buttons, use isIconOnly prop.
 */
export const sizeMap = {
  default: 'md',
  sm: 'sm',
  md: 'md',
  lg: 'lg',
  icon: 'md', // Use isIconOnly prop
  'icon-sm': 'sm', // Use isIconOnly prop
  'icon-lg': 'lg', // Use isIconOnly prop
} as const;
