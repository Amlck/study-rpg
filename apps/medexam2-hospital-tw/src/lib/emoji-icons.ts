const ICON_FILES: ReadonlyArray<readonly [string, string]> = [
  ['⏰', '23f0.png'],
  ['⏳', '231b.png'],
  ['⏸', '23f8.png'],
  ['▶', '25b6.png'],
  ['☁', '2601.png'],
  ['♻', '267b.png'],
  ['⚕', '2695.png'],
  ['⚖', '2696.png'],
  ['⚠', '26a0.png'],
  ['⚡', '26a1.png'],
  ['⚪', '26aa.png'],
  ['✅', '2705.png'],
  ['✏', '270f.png'],
  ['✨', '2728.png'],
  ['❌', '274c.png'],
  ['❓', '2753.png'],
  ['🌙', '1f319.png'],
  ['🌟', '1f31f.png'],
  ['🎁', '1f381.png'],
  ['🎉', '1f389.png'],
  ['🎟', '1f39f.png'],
  ['🎨', '1f3a8.png'],
  ['🎫', '1f3ab.png'],
  ['🎮', '1f3ae.png'],
  ['🎯', '1f3af.png'],
  ['🎲', '1f3b2.png'],
  ['🎴', '1f3b4.png'],
  ['🏆', '1f3c6.png'],
  ['🏗', '1f3d7.png'],
  ['🏥', '1f3e5.png'],
  ['🏷', '1f3f7.png'],
  ['🐞', '1f41e.png'],
  ['👋', '1f44b.png'],
  ['👤', '1f464.png'],
  ['👨', '1f468.png'],
  ['💡', '1f4a1.png'],
  ['💬', '1f4ac.png'],
  ['💰', '1f4b0.png'],
  ['📈', '1f4c8.png'],
  ['📋', '1f4cb.png'],
  ['📌', '1f4cc.png'],
  ['📑', '1f4d1.png'],
  ['📖', '1f4d6.png'],
  ['📚', '1f4da.png'],
  ['📝', '1f4dd.png'],
  ['📞', '1f4de.png'],
  ['📱', '1f4f1.png'],
  ['📷', '1f4f7.png'],
  ['🔀', '1f500.png'],
  ['🔁', '1f501.png'],
  ['🔄', '1f504.png'],
  ['🔒', '1f512.png'],
  ['🔴', '1f534.png'],
  ['🖼', '1f5bc.png'],
  ['😞', '1f61e.png'],
  ['🚑', '1f691.png'],
  ['🚨', '1f6a8.png'],
  ['🤷', '1f937.png'],
  ['🧹', '1f9f9.png'],
  ['★', '2b50.png'],
  ['☆', 'star_outline.png'],
  ['🩺', '1f9fa.png'],
  ['⬆', '2b06.png'],
  ['⚙', '2699.png'],
  ['▼', '25bc.png'],
];

const ICON_MAP = new Map(ICON_FILES);

function normalize(emoji: string): string {
  return emoji.replace(/️/g, '');
}

export function emojiIconUrl(emoji: string): string | null {
  const filename = ICON_MAP.get(normalize(emoji));
  return filename ? `${import.meta.env.BASE_URL}icons/emoji/${filename}` : null;
}

export function hasEmojiIcon(emoji: string): boolean {
  return ICON_MAP.has(normalize(emoji));
}
