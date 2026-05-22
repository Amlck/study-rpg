import { emojiIconUrl } from '../lib/emoji-icons';

type Props = {
  char: string;
  size?: number;
  className?: string;
  title?: string;
};

export function EmojiIcon({ char, size = 20, className, title }: Props) {
  const src = emojiIconUrl(char);
  if (!src) {
    return (
      <span className={className} style={{ fontSize: size, lineHeight: 1 }} title={title}>
        {char}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt={title ?? char}
      width={size}
      height={size}
      className={className}
      style={{ imageRendering: 'pixelated', verticalAlign: 'middle' }}
      title={title}
    />
  );
}
