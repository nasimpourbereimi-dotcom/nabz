import { describe, expect, it } from 'vitest';
import { attr, decodeEntities, parseAttrs, TagScanner, type Tag } from '../src/import/tagScanner';

const XML = `<?xml version="1.0"?>
<!DOCTYPE HealthData [
<!-- a comment with > inside -->
<!ELEMENT HealthData (Record*)>
<!ATTLIST Record
  type CDATA #REQUIRED
>
]>
<HealthData locale="en_IR">
 <Record type="A" sourceName="Odd > Source" value="1"/>
 <Record type="B" device="&lt;&lt;HKDevice&gt;" value="2">
  <MetadataEntry key="k" value="v"/>
 </Record>
 <Record type="C" sourceName=BROKEN startDate="nope"/>
 <Record type="D value="3"/>
 <Record type="E"
   value="5"/>
 <Workout workoutActivityType="W" startDate="s">
  <WorkoutStatistics type="HR" average="120"/>
 </Workout>
</HealthData>
`;

function scan(xml: string, chunk: number): Tag[] {
  const tags: Tag[] = [];
  const s = new TagScanner((t) => tags.push(t));
  for (let i = 0; i < xml.length; i += chunk) s.push(xml.slice(i, i + chunk));
  s.end();
  return tags;
}

describe('TagScanner', () => {
  const reference = scan(XML, XML.length);

  it('extracts tags and skips declarations/comments', () => {
    const names = reference.map((t) => (t.isEnd ? '/' : '') + t.name);
    expect(names).toEqual([
      'HealthData', 'Record', 'Record', 'MetadataEntry', '/Record', 'Record', 'Record', 'Workout',
      'WorkoutStatistics', '/Workout', '/HealthData',
    ]);
  });

  it('keeps ">" inside quoted attributes', () => {
    expect(parseAttrs(reference[1].raw).sourceName).toBe('Odd > Source');
  });

  it('skips a tag with an unterminated quote without losing following tags', () => {
    const types = reference.filter((t) => t.name === 'Record' && !t.isEnd).map((t) => attr(t.raw, 'type'));
    expect(types).toEqual(['A', 'B', 'C', 'E']);
  });

  it('is independent of chunk boundaries', () => {
    for (const size of [1, 2, 3, 5, 7, 13, 64]) {
      expect(scan(XML, size)).toEqual(reference);
    }
  });

  it('seek mode jumps straight to a literal', () => {
    const tags: Tag[] = [];
    const s = new TagScanner((t) => {
      tags.push(t);
      if (t.name === 'Workout' && !t.isEnd) s.seek = null;
    });
    s.seek = '<Workout ';
    for (let i = 0; i < XML.length; i += 4) s.push(XML.slice(i, i + 4));
    s.end();
    expect(tags.map((t) => t.name)).toEqual(['Workout', 'WorkoutStatistics', 'Workout', 'HealthData']);
  });

  it('decodes entities', () => {
    expect(decodeEntities('&lt;&lt;HKDevice&gt; &amp; &#1606;&#x628;')).toBe('<<HKDevice> & نب');
    expect(attr(reference[2].raw, 'device')).toBe('<<HKDevice>');
    expect(attr(' a="1"\n\tvalue="5"', 'value')).toBe('5');
  });
});
