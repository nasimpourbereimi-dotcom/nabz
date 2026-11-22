// The Shortcuts guide, bundled into the app so it opens offline and on filtered connections.
import guide from '../../docs/shortcuts-guide.fa.md?raw';
import { fa } from '../strings.fa';
import { IconBack } from '../ui/icons';
import { Markdown } from '../ui/Markdown';

export function GuideScreen({ onBack }: { onBack: () => void }) {
  return (
    <div class="screen no-tabs fade-in">
      <header class="row">
        <button class="icon-btn" aria-label={fa.back} onClick={onBack}><IconBack size={20} /></button>
      </header>
      <div style="margin-top:12px">
        <Markdown source={guide} />
      </div>
    </div>
  );
}
