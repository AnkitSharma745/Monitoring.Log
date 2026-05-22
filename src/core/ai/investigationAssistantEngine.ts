import type {
  EvidencePack,
  AiEvidenceResponse,
  EvidenceStrength,
  FindingCategory,
  AiCitation,
} from '@shared/contracts/ai';
import type { Incident, DomainRuleResult } from '@shared/contracts/investigations';
import type { IngestedDocument, TroubleshootingSymptom } from '@shared/contracts/knowledge';

export interface AssistantAnalysisInput {
  evidencePack: EvidencePack;
  ingestedDocuments?: IngestedDocument[];
  activeIncidents?: Incident[];
  validatedRules?: DomainRuleResult[];
}

export class InvestigationAssistantEngine {
  /**
   * Run the local evidence analysis pipeline on the structured evidence pack,
   * correlating rules, symptoms, and incident states to build an explainable diagnosis.
   */
  public static analyzeEvidence({
    evidencePack,
    ingestedDocuments = [],
    activeIncidents = [],
    validatedRules = [],
  }: AssistantAnalysisInput): AiEvidenceResponse {
    const trace: string[] = [];
    trace.push(`[${new Date().toISOString()}] Initiating local investigation assistance pipeline.`);
    trace.push(`[Trace] Packaged evidence: ${evidencePack.entries.length} log entries present.`);

    const observedFacts: string[] = [];
    const possibleCorrelations: string[] = [];
    const missingEvidence: string[] = [];
    const citations: AiCitation[] = [];

    const entries = evidencePack.entries;

    // 1. Gather rules and symptoms from knowledge base documents
    const symptoms = ingestedDocuments.flatMap((d) => d.symptoms);
    const customRules = ingestedDocuments.flatMap((d) => d.rules);
    trace.push(
      `[Trace] Loaded ${customRules.length} custom SLA rules, ${symptoms.length} knowledge symptoms, and ${activeIncidents.length} active incidents.`,
    );

    // 2. Perform SLA Rule Violations checks (Deterministic Boundary)
    const ruleViolations = validatedRules.filter((r) => r.status === 'violation');

    for (const rule of ruleViolations) {
      observedFacts.push(
        `SLA Violation detected: '${rule.name}' is active. Expected behavior: ${rule.expectedBehavior}`,
      );
      if (rule.evidenceEntryIds.length > 0) {
        citations.push({
          kind: 'businessRule',
          id: rule.ruleId,
          label: `SLA Rule: ${rule.name}`,
        });
      }
    }
    if (ruleViolations.length > 0) {
      trace.push(`[Trace] Identified ${ruleViolations.length} deterministic SLA rule violations.`);
    }

    // 3. Match Troubleshooting Symptoms from RAG manuals (Deterministic / Assisted Boundary)
    const matchedSymptoms: TroubleshootingSymptom[] = [];
    for (const symptom of symptoms) {
      const matchingEntries = entries.filter((e) => {
        const msg = (e.message || e.raw || '').toLowerCase();
        return symptom.symptomPatterns.every((pat) => msg.includes(pat.trim().toLowerCase()));
      });

      if (matchingEntries.length > 0) {
        matchedSymptoms.push(symptom);
        observedFacts.push(
          `Matched Troubleshooting Symptom: '${symptom.name}' (${symptom.description})`,
        );

        // Link matches in citations
        citations.push({
          kind: 'knownIncident',
          id: symptom.id,
          label: `Symptom Match: ${symptom.name}`,
        });

        // Generate possible correlation from symptom known resolution
        possibleCorrelations.push(
          `Symptom pattern matching '${symptom.name}' correlates to known issue. Recommended resolution: ${symptom.knownResolution}`,
        );
      }
    }
    trace.push(
      `[Trace] Matched ${matchedSymptoms.length} operational symptoms from knowledge base.`,
    );

    // 4. Chronological & Pattern-based Sequence Analysis (Heuristic Assistance)
    // 4.1 Reboot / Reset loops
    const resets = entries.filter((e) =>
      /reboot|reset|shutdown|kiosk_start|system_restart/i.test(e.message || ''),
    );
    if (resets.length > 0) {
      observedFacts.push(`Detected restart sequence containing ${resets.length} cycle(s).`);
      for (const r of resets) {
        citations.push({
          kind: 'logEntry',
          id: r.id,
          label: `Line ${r.lineNumber} reboot event`,
        });
      }
      if (resets.length >= 2) {
        possibleCorrelations.push(
          `Kiosk entered reset loop (observed ${resets.length} reboot logs). This indicates watchdog triggered self-repair due to critical software freeze or hardware failure.`,
        );
      }
    }

    // 4.2 Heartbeat SLA instability
    const offlinePings = entries.filter(
      (e) =>
        (/heartbeat|ping/i.test(e.message || '') && e.severity === 'error') ||
        /offline|disconnected|network drop/i.test(e.message || ''),
    );
    if (offlinePings.length > 0) {
      observedFacts.push(
        `Observed ${offlinePings.length} heartbeat or terminal disconnect occurrences.`,
      );
      if (offlinePings.length >= 3) {
        possibleCorrelations.push(
          `Terminal offline heartbeat loop pattern indicates severe network instability or backend endpoint disconnect.`,
        );
      }
      for (const e of offlinePings.slice(0, 3)) {
        citations.push({
          kind: 'logEntry',
          id: e.id,
          label: `Line ${e.lineNumber} offline/disconnect log`,
        });
      }
    }

    // 4.3 Payment failure sequence
    const paymentFails = entries.filter(
      (e) =>
        /payment|checkout|transaction|cashless/i.test(e.message || '') &&
        /fail|timeout|error|decline|retry/i.test(e.message || ''),
    );
    if (paymentFails.length > 0) {
      observedFacts.push(`Detected ${paymentFails.length} payment checkout failures/retries.`);
      for (const pf of paymentFails.slice(0, 3)) {
        citations.push({
          kind: 'logEntry',
          id: pf.id,
          label: `Line ${pf.lineNumber} payment exception`,
        });
      }
      if (paymentFails.length >= 3) {
        possibleCorrelations.push(
          `Checkout failed repeatedly across multiple retry attempts. Likely root cause: cashless merchant gateway connection dropout.`,
        );
      }
    }

    // 4.4 Hardware peripheral disconnects
    const peripheralIssues = entries.filter(
      (e) =>
        /printer|scanner|bill acceptor|card reader|usb/i.test(e.message || '') &&
        /disconnect|offline|error|critical|fail/i.test(e.message || ''),
    );
    if (peripheralIssues.length > 0) {
      observedFacts.push(
        `Hardware Peripheral issues: ${peripheralIssues.length} warning/error logs.`,
      );
      for (const p of peripheralIssues.slice(0, 3)) {
        citations.push({
          kind: 'hardwareState',
          id: p.id,
          label: `Line ${p.lineNumber} peripheral issue`,
        });
      }
    }

    // 5. Missing Evidence / Context Detection
    if (
      resets.length > 0 &&
      entries.filter((e) => /boot.*success|ready.*state/i.test(e.message || '')).length === 0
    ) {
      missingEvidence.push(
        'No terminal boot success or ready state entry observed following the reset sequences, suggesting the kiosk may still be offline.',
      );
    }
    if (
      paymentFails.length > 0 &&
      entries.filter((e) =>
        /transaction.*commit|payment.*success|receipt.*print/i.test(e.message || ''),
      ).length === 0
    ) {
      missingEvidence.push(
        'No successful payment transaction commit observed, confirming checkout failed completely.',
      );
    }
    if (missingEvidence.length === 0) {
      missingEvidence.push('No obvious gaps in the current chronological evidence chain.');
    }

    // 6. Calculate Confidence, Safety Category, and Evidence Strength
    let evidenceStrength: EvidenceStrength = 'low';
    let findingCategory: FindingCategory = 'assisted';

    if (ruleViolations.length > 0) {
      evidenceStrength = 'high';
      findingCategory = 'deterministic';
    } else if (matchedSymptoms.length > 0 || resets.length >= 2 || paymentFails.length >= 3) {
      evidenceStrength = 'medium';
      findingCategory = 'assisted';
    }

    trace.push(
      `[Trace] Classification complete: Strength=${evidenceStrength.toUpperCase()}, Category=${findingCategory.toUpperCase()}.`,
    );

    // 7. Compose Markdown Executive Summary
    let summary = `### Executive Operational Diagnosis\n\n`;

    if (findingCategory === 'deterministic') {
      summary += `> **[DETERMINISTIC DETECTION]** This incident represents a fully validated SLA breach with **High Evidence Strength**.\n\n`;
    } else {
      summary += `> **[AI-ASSISTED CORRELATION]** This represents a heuristic match with **${evidenceStrength.charAt(0).toUpperCase() + evidenceStrength.slice(1)} Evidence Strength**.\n\n`;
    }

    summary += `#### Primary Findings:\n`;
    if (observedFacts.length === 0) {
      summary += `- No distinct failure loops or anomalies detected in the selected log sequence.\n`;
    } else {
      observedFacts.forEach((fact) => {
        summary += `- ${fact}\n`;
      });
    }

    summary += `\n#### Possible Root Causes & Correlations:\n`;
    if (possibleCorrelations.length === 0) {
      summary += `- The log sequence exhibits standard healthy operations; no critical correlation chains were assembled.\n`;
    } else {
      possibleCorrelations.forEach((corr) => {
        summary += `- ${corr}\n`;
      });
    }

    summary += `\n#### Validation Coordinates:\n`;
    summary += `- **Total Checked Logs:** ${entries.length} lines\n`;
    summary += `- **SLA Rules Checked:** ${customRules.length} rules (${ruleViolations.length} violated)\n`;
    summary += `- **Symptom Profiles Checked:** ${symptoms.length} entries (${matchedSymptoms.length} matched)\n`;

    trace.push(`[${new Date().toISOString()}] Analysis successfully completed and formatted.`);

    return {
      id: crypto.randomUUID(),
      evidencePackId: evidencePack.id,
      summary,
      observedFacts,
      possibleCorrelations,
      missingEvidence,
      evidenceStrength,
      findingCategory,
      sourcesCount: {
        logs: entries.length,
        rules: ruleViolations.length,
        symptoms: matchedSymptoms.length,
      },
      citations,
      orchestrationTrace: trace,
      createdAt: new Date().toISOString(),
    };
  }
}
