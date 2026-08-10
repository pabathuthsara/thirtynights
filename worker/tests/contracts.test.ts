import { describe, expect, it } from 'vitest';

import { canonicalizeReportReferences, isClipCandidate, validateReportContract, type ReportResult, type TranscriptSegment } from '../src/contracts.js';

const segments: TranscriptSegment[] = [
  {
    id: 'segment-1',
    nightId: 'night-1',
    nightIndex: 1,
    startMs: 1_000,
    endMs: 8_000,
    text: 'I felt calmer after I took a long walk by the sea.',
  },
  {
    id: 'segment-2',
    nightId: 'night-2',
    nightIndex: 2,
    startMs: 500,
    endMs: 4_000,
    text: 'අද වැඩ ටික අමාරුයි, but I asked for help.',
  },
];

function report(overrides: Partial<ReportResult> = {}): ReportResult {
  return {
    report_version: 'v2',
    checkpoint_night: 7,
    summary: 'A cautious, evidence-grounded summary.',
    sections: [{
      title: 'A little more room',
      body: 'One night connected calm with walking.',
      guidance: 'Try one ten-minute walk this week and note whether anything shifts.',
      eyebrow: 'What appeared',
      evidence: [
        {
          night_id: 'night-1',
          segment_id: 'segment-1',
          start_ms: 1_000,
          end_ms: 8_000,
          quote: 'calmer after I took a long walk',
        },
        {
          night_id: 'night-2',
          segment_id: 'segment-2',
          start_ms: 500,
          end_ms: 4_000,
          quote: 'but I asked for help.',
        },
      ],
    }],
    clip_plan: [{
      night_id: 'night-1',
      segment_id: 'segment-1',
      start_ms: 1_000,
      end_ms: 8_000,
      quote: 'I felt calmer after I took a long walk by the sea.',
    }],
    ...overrides,
  };
}

describe('report worker contract', () => {
  it('accepts bounded evidence and normalized exact quotes', () => {
    const candidate = report({
      sections: [{
        title: 'Asking for help',
        body: 'The second night names a difficult day and an action.',
        guidance: 'Ask for help once before the pressure peaks.',
        eyebrow: 'What appeared',
        evidence: [
          {
            night_id: 'night-2',
            segment_id: 'segment-2',
            start_ms: 500,
            end_ms: 4_000,
            quote: 'අද වැඩ ටික අමාරුයි,   but I asked for help.',
          },
          report().sections[0]!.evidence[0]!,
        ],
      }],
    });
    expect(() => validateReportContract(candidate, { checkpoint_night: 7 }, segments, 'v2')).not.toThrow();
  });

  it('rejects a false quote', () => {
    const candidate = report();
    candidate.sections[0]!.evidence[0]!.quote = 'Everything was perfect.';
    expect(() => validateReportContract(candidate, { checkpoint_night: 7 }, segments, 'v2')).toThrow('report_false_quote');
  });

  it('rejects a citation assigned to the wrong night', () => {
    const candidate = report();
    candidate.sections[0]!.evidence[0]!.night_id = 'night-2';
    expect(() => validateReportContract(candidate, { checkpoint_night: 7 }, segments, 'v2')).toThrow('report_invalid_citation');
  });

  it('rejects clip boundaries outside the cited segment', () => {
    const candidate = report();
    candidate.clip_plan[0]!.end_ms = 8_001;
    expect(() => validateReportContract(candidate, { checkpoint_night: 7 }, segments, 'v2')).toThrow('report_invalid_citation');
  });

  it('rejects missing or blank evidence quotes', () => {
    const candidate = report();
    candidate.sections[0]!.evidence[0]!.quote = '  ';
    expect(() => validateReportContract(candidate, { checkpoint_night: 7 }, segments, 'v2')).toThrow('report_missing_quote');
  });

  it('rejects mismatched schema and checkpoint versions', () => {
    expect(() => validateReportContract(report(), { checkpoint_night: 30 }, segments, 'v2')).toThrow('report_contract_mismatch');
    expect(() => validateReportContract(report(), { checkpoint_night: 7 }, segments, 'v1')).toThrow('report_contract_mismatch');
  });

  it('enforces the mini-report section and clip limits', () => {
    const section = report().sections[0]!;
    const clip = report().clip_plan[0]!;
    expect(() => validateReportContract(
      report({ sections: [section, section, section] }),
      { checkpoint_night: 7 }, segments, 'v2',
    )).toThrow('report_contract_mismatch');
    expect(() => validateReportContract(
      report({ clip_plan: [clip, clip, clip, clip] }),
      { checkpoint_night: 7 }, segments, 'v2',
    )).toThrow('report_contract_mismatch');
  });

  it('rejects duplicate transcript segment identifiers', () => {
    expect(() => validateReportContract(report(), { checkpoint_night: 7 }, [...segments, segments[0]!], 'v2'))
      .toThrow('transcript_segment_id_collision');
  });

  it('rejects internal citation syntax in user-visible prose', () => {
    const candidate = report({ summary: 'A pattern appeared. [segment-1]' });
    expect(() => validateReportContract(candidate, { checkpoint_night: 7 }, segments, 'v2'))
      .toThrow('report_internal_citation_leak');
  });

  it('canonicalizes model-copied reference metadata from the selected segment', () => {
    const candidate = report();
    candidate.sections[0]!.evidence[0]!.night_id = 'wrong-night';
    candidate.sections[0]!.evidence[0]!.start_ms = 1_234;
    candidate.clip_plan[0]!.end_ms = 7_999;
    candidate.clip_plan[0]!.quote = 'calmer after a walk';

    const canonical = canonicalizeReportReferences(candidate, segments);
    expect(canonical.sections[0]!.evidence[0]).toMatchObject({ night_id: 'night-1', start_ms: 1_000, end_ms: 8_000 });
    expect(canonical.clip_plan[0]).toMatchObject({
      night_id: 'night-1', start_ms: 1_000, end_ms: 8_000,
      quote: 'I felt calmer after I took a long walk by the sea.',
    });
  });

  it('keeps complete thoughts and rejects filler-heavy audio candidates', () => {
    expect(isClipCandidate(segments[0]!)).toBe(true);
    expect(isClipCandidate({ ...segments[0]!, text: 'Um, uh, like, I was, um, trying but', endMs: 5_000 })).toBe(false);
    expect(isClipCandidate({ ...segments[0]!, text: 'I thought it would be wonderful and wonderful.' })).toBe(false);
  });
});
