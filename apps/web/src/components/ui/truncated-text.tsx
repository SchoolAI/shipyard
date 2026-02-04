import { Tooltip } from '@heroui/react';

interface TruncatedTextProps {
  text: string;
  maxLength?: number;
  className?: string;
  as?: 'span' | 'div' | 'p' | 'h1' | 'h2' | 'h3';
}

export function TruncatedText({
  text,
  maxLength = 50,
  className = '',
  as: Component = 'span',
}: TruncatedTextProps) {
  const isTruncated = text.length > maxLength;

  if (!isTruncated) {
    return <Component className={className}>{text}</Component>;
  }

  return (
    <Tooltip delay={0}>
      <Tooltip.Trigger>
        <Component className={className}>{text}</Component>
      </Tooltip.Trigger>
      <Tooltip.Content className="max-w-md">{text}</Tooltip.Content>
    </Tooltip>
  );
}
