export type WorkerJobContract = {
  checkpoint_night: number;
};

export type TranscriptSegment = {
  id: string;
  nightId: string;
  nightIndex: number;
  startMs: number;
  endMs: number;
  text: string;
};

export type ReportEvidence = {
  night_id: string;
  segment_id: string;
  start_ms: number;
  end_ms: number;
  quote?: string;
};

export type ReportResult = {
  report_version: string;
  checkpoint_night: number;
  summary: string;
  sections: Array<{
    title: string;
    body: string;
    eyebrow?: string;
    evidence: ReportEvidence[];
  }>;
  clip_plan: ReportEvidence[];
};

function normalizedText(value: string) {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('en');
}

function assertEvidence(value: ReportEvidence, segments: Map<string, TranscriptSegment>) {
  const source = segments.get(value.segment_id);
  if (
    !source ||
    source.nightId !== value.night_id ||
    !Number.isInteger(value.start_ms) ||
    !Number.isInteger(value.end_ms) ||
    value.start_ms < source.startMs ||
    value.end_ms > source.endMs ||
    value.end_ms <= value.start_ms
  ) {
    throw new Error('report_invalid_citation');
  }

  if (typeof value.quote !== 'string' || !normalizedText(value.quote)) {
    throw new Error('report_missing_quote');
  }
  if (!normalizedText(source.text).includes(normalizedText(value.quote))) {
    throw new Error('report_false_quote');
  }
}

export function validateReportContract(
  report: ReportResult,
  job: WorkerJobContract,
  segments: TranscriptSegment[],
  schemaVersion: string,
) {
  if (
    !report ||
    report.report_version !== schemaVersion ||
    report.checkpoint_night !== job.checkpoint_night ||
    typeof report.summary !== 'string' ||
    !Array.isArray(report.sections) ||
    !Array.isArray(report.clip_plan)
  ) {
    throw new Error('report_contract_mismatch');
  }

  const sectionLimit = job.checkpoint_night === 7 ? 2 : 5;
  if (report.sections.length > sectionLimit || (job.checkpoint_night === 7 && report.clip_plan.length > 1)) {
    throw new Error('report_contract_mismatch');
  }

  const byId = new Map(segments.map((segment) => [segment.id, segment]));
  if (byId.size !== segments.length) throw new Error('transcript_segment_id_collision');

  for (const section of report.sections) {
    if (
      !section ||
      typeof section.title !== 'string' ||
      typeof section.body !== 'string' ||
      !Array.isArray(section.evidence)
    ) {
      throw new Error('report_contract_mismatch');
    }
    for (const evidence of section.evidence) assertEvidence(evidence, byId);
  }
  for (const evidence of report.clip_plan) assertEvidence(evidence, byId);
}
