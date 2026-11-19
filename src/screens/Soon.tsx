import { fa } from '../strings.fa';

export function SoonScreen({ title }: { title: string }) {
  return (
    <div class="screen fade-in">
      <h1 class="h1">{title}</h1>
      <div class="card suggest" style="margin-top:18px;font-size:14px;line-height:1.8">
        <div style="font-weight:700;margin-bottom:4px">{fa.soon.title}</div>
        {fa.soon.lead}
      </div>
    </div>
  );
}
