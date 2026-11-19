/** Calm empty state with one clear next step (CLAUDE.md §7: never a dead end). */
export function EmptyState({ text, action, onAction }: { text: string; action: string; onAction: () => void }) {
  return (
    <div class="card suggest stack fade-in" style="margin-top:18px;gap:12px">
      <div style="font-size:14px;line-height:1.8">{text}</div>
      <button class="btn" onClick={onAction}>{action}</button>
    </div>
  );
}
