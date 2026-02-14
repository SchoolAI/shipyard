interface IconProps {
  className?: string;
}

export function ClaudeIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 2 L13.2 8.5 L18 4.2 L14.8 10 L22 10.5 L15.5 13 L20.5 18 L13.8 14.5 L12 22 L10.2 14.5 L3.5 18 L8.5 13 L2 10.5 L9.2 10 L6 4.2 L10.8 8.5 Z" />
    </svg>
  );
}

export function OpenAIIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 2C12 2 14.5 5.5 14.5 8.5C14.5 10.2 13.8 11.2 12 12C13.8 11.2 15.2 11.5 16.5 12.7C18.6 14.8 19.8 17.3 19.8 17.3C19.8 17.3 16.8 17.8 14.2 16.1C13 15.3 12.5 14.2 12 12C12.5 14.2 12 15.6 10.8 16.5C8.2 18.4 5.2 18.3 5.2 18.3C5.2 18.3 7 15.3 9.5 13.7C10.7 12.9 11.8 12.7 12 12C11.8 12.7 10.7 13.1 9.2 12.9C6.2 12.5 3.8 10.8 3.8 10.8C3.8 10.8 6.8 9.3 9.5 9.6C10.9 9.8 11.8 10.5 12 12C11.8 10.5 12.2 9.2 13.5 8.2C15.8 6.5 18.8 6.2 18.8 6.2C18.8 6.2 17.3 9.2 15 10.9C13.8 11.8 12.5 12 12 12C12.5 12 13.2 11 13.2 9.5C13.2 6.5 12 2 12 2Z" />
    </svg>
  );
}

export function GeminiIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 2C12 8.5 6.5 12 2 12C6.5 12 12 15.5 12 22C12 15.5 17.5 12 22 12C17.5 12 12 8.5 12 2Z" />
    </svg>
  );
}
