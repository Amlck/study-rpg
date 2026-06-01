import type { CSSProperties } from 'react';
import { emojiIconUrl } from '../lib/emoji-icons';

type Props = {
  char: string;
  size?: number;
  className?: string;
  title?: string;
};

// `draggable={false}` + the two CSS rules suppress native HTML5 image drag so
// framer-motion swipe handlers (e.g. RecruitmentResultModal's SwipeToAnswer 📞
// phone) aren't stolen by the browser's drag-image pointer capture. Safe
// globally — emojis are decorative icons with no drag use case.
const IMG_STYLE: CSSProperties = {
  imageRendering: 'pixelated',
  verticalAlign: 'middle',
  WebkitUserDrag: 'none',
  userSelect: 'none',
} as CSSProperties;

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
      draggable={false}
      style={IMG_STYLE}
      title={title}
    />
  );
}
