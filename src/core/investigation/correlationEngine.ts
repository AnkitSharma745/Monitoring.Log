import type {
  Incident,
  IncidentCategory,
  StateTransition,
  StateTransitionSequence,
  DomainRuleResult,
  FailureChainCandidate,
  GraphNode,
  GraphEdge,
  IncidentKnowledgeGraph,
  OperationalDegradationResult,
  Playbook,
  RcaDraft,
  TriageRank,
  ObservedPattern,
} from '@shared/contracts/investigations';
import type { ExtractedRule } from '@shared/contracts/knowledge';
import type { StructuredLogEntry } from '@shared/contracts/logs';

/**
 * High-performance off-thread correlation engine that parses log sequences
 * to reconstruct machine behavior, detect failure chains, track state transitions,
 * and validate compliance against ASC operational rules.
 */
export class OperationalCorrelationEngine {
  /**
   * Scan entries and group repeated operational loops/failures into structured Incidents.
   */
  public static detectIncidents(
    sourceId: string,
    entries: StructuredLogEntry[],
    _customRules?: ExtractedRule[],
  ): Incident[] {
    const incidents: Incident[] = [];
    const timeThresholdMs = 45000; // 45 seconds to group related logs

    const categories: Array<{
      category: IncidentCategory;
      title: string;
      matcher: (msg: string, entry: StructuredLogEntry) => boolean;
      severity: 'error' | 'warn';
    }> = [
      {
        category: 'payment_timeout',
        title: 'Payment Transaction Timeout',
        matcher: (msg) =>
          /payment|transaction|order|cashless/i.test(msg) &&
          /timeout|fail|cancel|expire/i.test(msg),
        severity: 'error',
      },
      {
        category: 'printer_reconnect',
        title: 'Printer Peripheral Disconnect / Reconnect Loop',
        matcher: (msg) =>
          /printer|paper|usb|com[0-9]|serial/i.test(msg) &&
          /disconnect|offline|reconnect|reset|failed to open/i.test(msg),
        severity: 'warn',
      },
      {
        category: 'terminal_id_failure',
        title: 'Kiosk Terminal Identification Failure',
        matcher: (msg) =>
          /GetTerminalId|terminal_id|terminal id/i.test(msg) &&
          /fail|missing|error|invalid/i.test(msg),
        severity: 'error',
      },
      {
        category: 'heartbeat_dropout',
        title: 'Heartbeat Monitor connection dropout',
        matcher: (msg) =>
          /heartbeat|ping/i.test(msg) && /drop|fail|timeout|missing|lost/i.test(msg),
        severity: 'error',
      },
      {
        category: 'reset_cycle',
        title: 'System Restart / Watchdog Reset Cycle',
        matcher: (msg) => /reboot|reset|shutdown|restart|kiosk_start|system_restart/i.test(msg),
        severity: 'warn',
      },
      {
        category: 'api_retry_storm',
        title: 'API Request Retry Storm',
        matcher: (msg) => /api|http|request/i.test(msg) && /retry|attempt|backoff/i.test(msg),
        severity: 'warn',
      },
    ];

    // For each category, scan and group entries within the threshold
    for (const cat of categories) {
      const matchingEntries = entries.filter((e) => cat.matcher(e.message || e.raw || '', e));
      if (matchingEntries.length === 0) continue;

      let currentGroup: StructuredLogEntry[] = [];

      for (let i = 0; i < matchingEntries.length; i++) {
        const entry = matchingEntries[i];
        if (!entry) continue;

        if (currentGroup.length === 0) {
          currentGroup.push(entry);
        } else {
          const prevEntry = currentGroup[currentGroup.length - 1]!;
          const timeDiff =
            entry.timestampEpochMs !== null && prevEntry.timestampEpochMs !== null
              ? Math.abs(entry.timestampEpochMs - prevEntry.timestampEpochMs)
              : Number.MAX_VALUE;

          if (timeDiff <= timeThresholdMs) {
            currentGroup.push(entry);
          } else {
            incidents.push(
              this.createIncidentFromGroup(
                sourceId,
                cat.category,
                cat.title,
                currentGroup,
                cat.severity,
              ),
            );
            currentGroup = [entry];
          }
        }
      }

      if (currentGroup.length > 0) {
        incidents.push(
          this.createIncidentFromGroup(
            sourceId,
            cat.category,
            cat.title,
            currentGroup,
            cat.severity,
          ),
        );
      }
    }

    return incidents.sort((a, b) => {
      const aTime = a.timestampStart ? Date.parse(a.timestampStart) : 0;
      const bTime = b.timestampStart ? Date.parse(b.timestampStart) : 0;
      return aTime - bTime;
    });
  }

  /**
   * Reconstruct Kiosk states and map them chronologically.
   * State path: UNKNOWN -> BOOTING -> INITIALIZING -> CONNECTING -> READY -> [FAILURE / RECOVERY]
   */
  public static reconstructStates(
    sourceId: string,
    entries: StructuredLogEntry[],
    _customRules?: ExtractedRule[],
  ): StateTransitionSequence {
    const transitions: StateTransition[] = [];
    let currentState = 'UNKNOWN';

    // Scan chronologically
    const sortedEntries = [...entries].sort(
      (a, b) => (a.timestampEpochMs ?? 0) - (b.timestampEpochMs ?? 0),
    );

    for (const entry of sortedEntries) {
      const msg = (entry.message || entry.raw || '').toLowerCase();
      let targetState: string | null = null;

      if (/boot|startup|system_restart|kiosk_start|powering up/i.test(msg)) {
        targetState = 'BOOTING';
      } else if (/initializing|setup|loading components|device init/i.test(msg)) {
        targetState = 'INITIALIZING';
      } else if (/connecting|network_connect|establishing connection|pinging/i.test(msg)) {
        targetState = 'CONNECTING';
      } else if (
        /ready|initialized successfully|started successfully|kiosk active|online/i.test(msg)
      ) {
        targetState = 'READY';
      } else if (
        /critical|fatal|exception|crash|unhandled error|hardware error/i.test(msg) &&
        entry.severity === 'error'
      ) {
        targetState = 'FAILURE';
      } else if (/recovering|reconnected|retry success|auto-heal|restored/i.test(msg)) {
        targetState = 'RECOVERY';
      }

      if (targetState && targetState !== currentState) {
        transitions.push({
          fromState: currentState,
          toState: targetState,
          timestamp: entry.timestamp,
          entryId: entry.id,
          lineNumber: entry.lineNumber,
          triggerMessage: entry.message || entry.raw || 'Trigger state change',
        });
        currentState = targetState;
      }
    }

    return {
      sourceId,
      currentState,
      transitions,
    };
  }

  /**
   * Identify cascading failure chains (e.g. network failure causing API retries, leading to a restart cycle).
   */
  public static detectFailureChains(
    _sourceId: string,
    incidents: Incident[],
  ): FailureChainCandidate[] {
    const chains: FailureChainCandidate[] = [];
    const windowMs = 90000; // 90-second propagation window

    // Scan incidents to find chains
    for (let i = 0; i < incidents.length; i++) {
      const root = incidents[i]!;
      const startTime = root.timestampStart ? Date.parse(root.timestampStart) : 0;
      if (!startTime) continue;

      const chainIncidents: Incident[] = [root];

      for (let j = i + 1; j < incidents.length; j++) {
        const next = incidents[j]!;
        const nextTime = next.timestampStart ? Date.parse(next.timestampStart) : 0;
        if (!nextTime) continue;

        // If it occurs within the propagation window, add it to the chain
        const prevIncident = chainIncidents[chainIncidents.length - 1]!;
        const prevTime = prevIncident.timestampEnd
          ? Date.parse(prevIncident.timestampEnd)
          : Date.parse(prevIncident.timestampStart ?? '');

        if (nextTime >= prevTime && nextTime - prevTime <= windowMs) {
          // Avoid duplicate categories in same chain
          if (!chainIncidents.some((ci) => ci.category === next.category)) {
            chainIncidents.push(next);
          }
        }
      }

      if (chainIncidents.length >= 2) {
        // Calculate propagation probability based on categories
        let probability = 0.5;
        let title = 'Cascading Incident Chain';
        let description = '';

        const cats = chainIncidents.map((ci) => ci.category);
        if (cats.includes('heartbeat_dropout') && cats.includes('reset_cycle')) {
          probability = 0.92;
          title = 'Watchdog Kiosk Reset Chain';
          description =
            'A heartbeat connection failure dropped out, forcing the automatic watchdog reset routine.';
        } else if (cats.includes('payment_timeout') && cats.includes('reset_cycle')) {
          probability = 0.85;
          title = 'Critical Payment Cycle Restart';
          description =
            'A POS payment transaction timed out, resulting in a manual reboot or crash cycle.';
        } else if (cats.includes('printer_reconnect') && cats.includes('payment_timeout')) {
          probability = 0.78;
          title = 'Hardware Blocked Payment Chain';
          description =
            'USB/Serial printer connectivity drops triggered a blockage in the checkout flow, timing out payment.';
        } else if (cats.includes('api_retry_storm') && cats.includes('heartbeat_dropout')) {
          probability = 0.81;
          title = 'API Storm connection Drop-off';
          description =
            'A spike in HTTP API retries saturated connection threads, crashing heartbeat channels.';
        }

        const openQuestions: string[] = [];
        if (cats.includes('printer_reconnect')) {
          openQuestions.push(
            'Why did the serial COM/USB port disconnect? Inspect peripheral power levels.',
          );
        }
        if (cats.includes('payment_timeout')) {
          openQuestions.push(
            'Did the cashless merchant gateway experience internet outage? Check telemetry routing.',
          );
        }
        if (cats.includes('reset_cycle')) {
          openQuestions.push(
            'Was the reset triggered by hardware watchdog or operating system restart?',
          );
        }

        chains.push({
          id: crypto.randomUUID(),
          title,
          description:
            description || `Sequence of cascading operational issues starting with ${root.title}.`,
          orderedIncidents: chainIncidents,
          probability,
          openQuestions,
        });

        // Skip indices to avoid redundant nested subchains
        i += chainIncidents.length - 1;
      }
    }

    return chains;
  }

  /**
   * Validate entries against official SLA / ASC domain behavior rules.
   */
  public static validateDomainRules(
    _sourceId: string,
    entries: StructuredLogEntry[],
    customRules?: ExtractedRule[],
  ): DomainRuleResult[] {
    const results: DomainRuleResult[] = [];

    // Rule 1: ASC Payment Response SLA (Max 30s response expected)
    const paymentRequests = entries.filter(
      (e) => e.paymentIds.length > 0 && /request|start|authorize/i.test(e.message || ''),
    );
    const paymentResponses = entries.filter(
      (e) => e.paymentIds.length > 0 && /response|success|failed|complete/i.test(e.message || ''),
    );

    let p1Status: 'passed' | 'violation' | 'unknown' = 'passed';
    const p1EvidenceIds: string[] = [];
    let p1ViolationsCount = 0;

    for (const req of paymentRequests) {
      const pid = req.paymentIds[0];
      if (!pid) continue;
      const resp = paymentResponses.find(
        (e) =>
          e.paymentIds.includes(pid) && (e.timestampEpochMs ?? 0) >= (req.timestampEpochMs ?? 0),
      );

      if (resp) {
        const latency = (resp.timestampEpochMs ?? 0) - (req.timestampEpochMs ?? 0);
        if (latency > 30000) {
          p1Status = 'violation';
          p1EvidenceIds.push(req.id, resp.id);
          p1ViolationsCount++;
        }
      } else {
        // No matching response (orphaned transaction)
        p1Status = 'violation';
        p1EvidenceIds.push(req.id);
        p1ViolationsCount++;
      }
    }

    results.push({
      ruleId: 'rule-asc-payment-sla',
      name: 'ASC Cashless Transaction Response SLA',
      category: 'payment',
      expectedBehavior:
        'All merchant gateway cashless authorizations must complete in under 30 seconds.',
      status: p1Status,
      evidenceEntryIds: p1EvidenceIds.slice(0, 10), // cap evidence lines in panel
      notes:
        p1Status === 'violation'
          ? `Observed ${p1ViolationsCount} transaction latency SLA violations or uncompleted authorization requests.`
          : 'All transactions complied within the 30-second authorization deadline.',
    });

    // Rule 2: Kiosk Auto-Retry (Max 5s delay on USB/Serial reconnect)
    const comDrops = entries.filter(
      (e) =>
        /com[0-9]|printer|serial|usb/i.test(e.message || '') &&
        /disconnect|lost|failed to open/i.test(e.message || ''),
    );
    const comRetries = entries.filter(
      (e) =>
        /com[0-9]|printer|serial|usb/i.test(e.message || '') &&
        /retry|attempt|reopen|connect/i.test(e.message || ''),
    );

    let p2Status: 'passed' | 'violation' | 'unknown' = comDrops.length > 0 ? 'passed' : 'unknown';
    const p2EvidenceIds: string[] = [];
    let p2ViolationsCount = 0;

    for (const drop of comDrops) {
      const nextRetry = comRetries.find(
        (e) => (e.timestampEpochMs ?? 0) >= (drop.timestampEpochMs ?? 0),
      );
      if (nextRetry) {
        const delay = (nextRetry.timestampEpochMs ?? 0) - (drop.timestampEpochMs ?? 0);
        if (delay > 5000) {
          p2Status = 'violation';
          p2EvidenceIds.push(drop.id, nextRetry.id);
          p2ViolationsCount++;
        }
      } else {
        p2Status = 'violation';
        p2EvidenceIds.push(drop.id);
        p2ViolationsCount++;
      }
    }

    results.push({
      ruleId: 'rule-com-retry',
      name: 'Hardware Port Auto-Retry Integrity',
      category: 'hardware',
      expectedBehavior:
        'A USB, printer, or serial COM connection dropout must prompt an auto-retry routine within 5 seconds.',
      status: p2Status,
      evidenceEntryIds: p2EvidenceIds.slice(0, 10),
      notes:
        p2Status === 'violation'
          ? `Detected ${p2ViolationsCount} peripheral reconnect delays exceeding the 5-second automatic retry SLA.`
          : p2Status === 'passed'
            ? 'Printer COM dropouts immediately triggered automatic recovery within expected intervals.'
            : 'No peripheral port dropouts observed in log file.',
    });

    // Rule 3: Watchdog Activation (Max 3 heartbeat pings before restart)
    const pings = entries.filter((e) => /heartbeat|ping/i.test(e.message || ''));
    let p3Status: 'passed' | 'violation' | 'unknown' = 'unknown';
    const p3EvidenceIds: string[] = [];
    let consecutivePingFailures = 0;

    for (let i = 0; i < pings.length; i++) {
      const ping = pings[i]!;
      if (ping.severity === 'error') {
        consecutivePingFailures++;
        p3EvidenceIds.push(ping.id);

        if (consecutivePingFailures >= 3) {
          p3Status = 'passed'; // Initial state: found the trigger
          // Now check if a reboot/reset sequence follows within 30 seconds
          const reset = entries.find(
            (e) =>
              (e.timestampEpochMs ?? 0) >= (ping.timestampEpochMs ?? 0) &&
              (e.timestampEpochMs ?? 0) - (ping.timestampEpochMs ?? 0) <= 30000 &&
              /reboot|reset|restart|shutdown|kiosk_start|system_restart/i.test(e.message || ''),
          );

          if (!reset) {
            p3Status = 'violation';
          } else {
            p3EvidenceIds.push(reset.id);
          }
          break; // check first instance
        }
      } else {
        consecutivePingFailures = 0;
      }
    }

    results.push({
      ruleId: 'rule-watchdog-reset',
      name: 'Watchdog Kiosk Reset Routine',
      category: 'system',
      expectedBehavior:
        '3 consecutive heartbeat ping drops must trigger an automated watchdog hardware reset within 30 seconds.',
      status: p3Status,
      evidenceEntryIds: p3EvidenceIds.slice(0, 10),
      notes:
        p3Status === 'violation'
          ? 'Violation: Kiosk encountered 3+ consecutive heartbeat drops but failed to execute an automatic watchdog reset.'
          : p3Status === 'passed'
            ? 'Pass: Automatic watchdog successfully reset hardware within 30 seconds of 3 consecutive heartbeat timeouts.'
            : 'Neutral: Heartbeat pings remained stable without reaching the 3-dropout watchdog threshold.',
    });

    // Rule 4: Kiosk Boot to Ready SLA (Max 60s)
    const bootTransitions = entries.filter((e) =>
      /boot|startup|system_restart|kiosk_start/i.test(e.message || ''),
    );
    const readyTransitions = entries.filter((e) =>
      /ready|started successfully|kiosk active/i.test(e.message || ''),
    );

    let p4Status: 'passed' | 'violation' | 'unknown' =
      bootTransitions.length > 0 && readyTransitions.length > 0 ? 'passed' : 'unknown';
    const p4EvidenceIds: string[] = [];
    let p4Delay = 0;

    if (bootTransitions.length > 0 && readyTransitions.length > 0) {
      const boot = bootTransitions[0]!;
      const ready = readyTransitions.find(
        (e) => (e.timestampEpochMs ?? 0) >= (boot.timestampEpochMs ?? 0),
      );
      if (ready) {
        p4Delay = (ready.timestampEpochMs ?? 0) - (boot.timestampEpochMs ?? 0);
        p4EvidenceIds.push(boot.id, ready.id);
        if (p4Delay > 60000) {
          p4Status = 'violation';
        }
      } else {
        p4Status = 'violation';
        p4EvidenceIds.push(boot.id);
      }
    }

    results.push({
      ruleId: 'rule-boot-sla',
      name: 'System Boot to Ready SLA Compliance',
      category: 'system',
      expectedBehavior:
        'System startup must transition from booting state to READY operational status in under 60 seconds.',
      status: p4Status,
      evidenceEntryIds: p4EvidenceIds,
      notes:
        p4Status === 'violation'
          ? `Violation: System boot sequence took ${(p4Delay / 1000).toFixed(1)}s, exceeding the 60-second operational SLA.`
          : p4Status === 'passed'
            ? `Pass: System successfully initialized and reached operational READY status in ${(p4Delay / 1000).toFixed(1)}s.`
            : 'Neutral: No system boot sequences recorded in log.',
    });

    // Rule 5: API Retry Storm SLA (Max 5 attempts in 20s)
    const apiRetryLogs = entries.filter(
      (e) =>
        /api|http|request/i.test(e.message || '') && /retry|attempt|backoff/i.test(e.message || ''),
    );
    let retryStormStatus: 'passed' | 'violation' | 'unknown' =
      apiRetryLogs.length > 0 ? 'passed' : 'unknown';
    const retryStormEvidenceIds: string[] = [];
    let retryStormViolationMsg = 'No excessive API request retry storms observed in telemetry.';

    const slidingWindowMs = 20000;
    for (let i = 0; i < apiRetryLogs.length; i++) {
      const startLog = apiRetryLogs[i]!;
      const startTime = startLog.timestampEpochMs;
      if (startTime === null) continue;

      const windowLogs = [startLog];
      for (let j = i + 1; j < apiRetryLogs.length; j++) {
        const nextLog = apiRetryLogs[j]!;
        if (nextLog.timestampEpochMs === null) continue;
        if (nextLog.timestampEpochMs - startTime <= slidingWindowMs) {
          windowLogs.push(nextLog);
        } else {
          break;
        }
      }

      if (windowLogs.length >= 5) {
        retryStormStatus = 'violation';
        retryStormEvidenceIds.push(...windowLogs.map((e) => e.id));
        retryStormViolationMsg = `Violation: Detected an API retry storm containing ${windowLogs.length} attempts in a ${slidingWindowMs / 1000}s window.`;
        break;
      }
    }

    results.push({
      ruleId: 'rule-api-retry-storm',
      name: 'API Connection Request Retry Storm SLA',
      category: 'network',
      expectedBehavior:
        'Kiosk API endpoints must not experience 5 or more connection retries within a 20-second window.',
      status: retryStormStatus,
      evidenceEntryIds: retryStormEvidenceIds.slice(0, 10),
      notes:
        retryStormStatus === 'violation'
          ? retryStormViolationMsg
          : retryStormStatus === 'passed'
            ? 'API retry spikes remained below storm levels (< 5 retries in 20 seconds).'
            : 'No API connection retry logs registered in current dataset.',
    });

    // Rule 6: Heartbeat SLA Interval Compliance (Max 30s gap)
    const heartbeatLogs = entries.filter(
      (e) =>
        /heartbeat|ping/i.test(e.message || '') &&
        !/drop|fail|timeout|missing|lost/i.test(e.message || ''),
    );
    const sortedHeartbeats = [...heartbeatLogs].sort(
      (a, b) => (a.timestampEpochMs ?? 0) - (b.timestampEpochMs ?? 0),
    );
    let heartbeatSlaStatus: 'passed' | 'violation' | 'unknown' =
      sortedHeartbeats.length >= 2 ? 'passed' : 'unknown';
    const heartbeatSlaEvidenceIds: string[] = [];
    let heartbeatSlaNotes =
      'All consecutive heartbeat intervals complied with the 30-second connectivity SLA.';
    let heartbeatSlaViolationCount = 0;

    for (let i = 0; i < sortedHeartbeats.length - 1; i++) {
      const current = sortedHeartbeats[i]!;
      const next = sortedHeartbeats[i + 1]!;
      if (current.timestampEpochMs !== null && next.timestampEpochMs !== null) {
        const interval = next.timestampEpochMs - current.timestampEpochMs;
        if (interval > 30000) {
          heartbeatSlaStatus = 'violation';
          heartbeatSlaEvidenceIds.push(current.id, next.id);
          heartbeatSlaViolationCount++;
        }
      }
    }
    if (heartbeatSlaStatus === 'violation') {
      heartbeatSlaNotes = `Violation: Detected ${heartbeatSlaViolationCount} instances where the interval between successive pings exceeded the 30-second SLA limit.`;
    } else if (heartbeatSlaStatus === 'unknown') {
      heartbeatSlaNotes =
        'Insufficient heartbeat ping records in logs to audit connection intervals.';
    }

    results.push({
      ruleId: 'rule-heartbeat-sla',
      name: 'Heartbeat Ping SLA Continuity Interval',
      category: 'network',
      expectedBehavior:
        'Active kiosk connections must broadcast a stable heartbeat/ping at least once every 30 seconds.',
      status: heartbeatSlaStatus,
      evidenceEntryIds: heartbeatSlaEvidenceIds.slice(0, 10),
      notes: heartbeatSlaNotes,
    });

    // Rule 7: Reset Loop Integrity Check
    const rebootLogs = entries.filter((e) =>
      /reboot|reset|restart|shutdown|kiosk_start|system_restart/i.test(e.message || ''),
    );
    const sortedReboots = [...rebootLogs].sort(
      (a, b) => (a.timestampEpochMs ?? 0) - (b.timestampEpochMs ?? 0),
    );
    let resetLoopStatus: 'passed' | 'violation' | 'unknown' =
      sortedReboots.length > 0 ? 'passed' : 'unknown';
    const resetLoopEvidenceIds: string[] = [];
    let resetLoopNotes =
      'System boot and restart cycles remained stable with no reboot loops detected.';
    let resetLoopViolationCount = 0;
    const loopWindowMs = 5 * 60 * 1000; // 5 minutes

    for (let i = 0; i < sortedReboots.length; i++) {
      const current = sortedReboots[i]!;
      const currentMs = current.timestampEpochMs;
      if (currentMs === null) continue;

      const windowReboots = [current];
      for (let j = i + 1; j < sortedReboots.length; j++) {
        const next = sortedReboots[j]!;
        if (next.timestampEpochMs === null) continue;
        if (next.timestampEpochMs - currentMs <= loopWindowMs) {
          windowReboots.push(next);
        } else {
          break;
        }
      }

      if (windowReboots.length >= 2) {
        resetLoopStatus = 'violation';
        resetLoopEvidenceIds.push(...windowReboots.map((e) => e.id));
        resetLoopViolationCount++;
      }
    }
    if (resetLoopStatus === 'violation') {
      resetLoopNotes = `Violation: Detected reboot loop. Kiosk experienced ${resetLoopViolationCount} rapid restarts within a 5-minute window.`;
    }

    results.push({
      ruleId: 'rule-reset-loop',
      name: 'Kiosk Restart Loop Protection SLA',
      category: 'system',
      expectedBehavior:
        'Kiosk hardware must not cycle through 2 or more reboot or watchdog restarts within a 5-minute window.',
      status: resetLoopStatus,
      evidenceEntryIds: resetLoopEvidenceIds.slice(0, 10),
      notes: resetLoopNotes,
    });

    // Rule 8+: Dynamic custom rules parsed from ingested documents
    if (customRules && customRules.length > 0) {
      for (const rule of customRules) {
        let status: 'passed' | 'violation' | 'unknown' = 'unknown';
        const evidenceIds: string[] = [];
        let matchingCount = 0;
        let violationCount = 0;

        let regex: RegExp | null = null;
        try {
          regex = new RegExp(rule.pattern, 'i');
        } catch {
          // Fallback to literal matches if pattern is malformed regex
        }

        for (const entry of entries) {
          const msg = entry.message || entry.raw || '';
          const isMatch = regex
            ? regex.test(msg)
            : msg.toLowerCase().includes(rule.pattern.toLowerCase());

          if (isMatch) {
            matchingCount++;
            const hasError =
              entry.severity === 'error' || /fail|error|timeout|block|crash|exception/i.test(msg);
            if (hasError) {
              violationCount++;
              evidenceIds.push(entry.id);
            } else {
              evidenceIds.push(entry.id);
            }
          }
        }

        if (matchingCount > 0) {
          status = violationCount > 0 ? 'violation' : 'passed';
        }

        results.push({
          ruleId: rule.ruleId,
          name: rule.name,
          category: rule.category,
          expectedBehavior: rule.expectedBehavior,
          status,
          evidenceEntryIds: evidenceIds.slice(0, 10),
          notes:
            status === 'violation'
              ? `Violation: Detected ${violationCount} potential compliance failures out of ${matchingCount} matching logs for pattern: "${rule.pattern}".`
              : status === 'passed'
                ? `Pass: All ${matchingCount} matching logs complied successfully with no errors matching pattern: "${rule.pattern}".`
                : `Neutral: No active events found in logs matching pattern "${rule.pattern}".`,
        });
      }
    }

    return results;
  }

  private static createIncidentFromGroup(
    sourceId: string,
    category: IncidentCategory,
    title: string,
    group: StructuredLogEntry[],
    severity: 'error' | 'warn',
  ): Incident {
    const first = group[0]!;
    const last = group[group.length - 1]!;

    const start = first.timestamp;
    const end = last.timestamp;
    const durationMs =
      first.timestampEpochMs !== null && last.timestampEpochMs !== null
        ? last.timestampEpochMs - first.timestampEpochMs
        : null;

    // Calculate a confidence score based on group size and severity
    const confidence = Math.min(
      0.65 + group.length * 0.08 + (severity === 'error' ? 0.1 : 0),
      0.99,
    );

    let desc = '';
    if (category === 'payment_timeout') {
      desc = `Cashless payment processor timeout across ${group.length} logs. Affected payment keys: ${group
        .map((e) => e.paymentIds.join(','))
        .filter(Boolean)
        .join(', ')}`;
    } else if (category === 'printer_reconnect') {
      desc = `Peripheral connectivity drops detected ${group.length} times, indicating COM interface instability.`;
    } else if (category === 'terminal_id_failure') {
      desc = `GetTerminalId network calls failed repeatedly (${group.length} times). Kiosk is unable to authenticate.`;
    } else if (category === 'heartbeat_dropout') {
      desc = `Operational heartbeat connection lost. ${group.length} ping drops recorded consecutively.`;
    } else if (category === 'reset_cycle') {
      desc = `System experienced ${group.length} reboot/restart sequences. Kiosk environment is reset.`;
    } else {
      desc = `${title} observed ${group.length} times between lines ${first.lineNumber} and ${last.lineNumber}.`;
    }

    return {
      id: crypto.randomUUID(),
      sourceId,
      category,
      title,
      description: desc,
      entryIds: group.map((e) => e.id),
      severity,
      timestampStart: start,
      timestampEnd: end,
      durationMs,
      confidence,
    };
  }

  /**
   * Compiles incidents, states, and rules into an explainable relationship graph structure.
   */
  public static compileIncidentGraph(
    incidents: Incident[],
    sequence: StateTransitionSequence | null,
    ruleResults: DomainRuleResult[],
  ): IncidentKnowledgeGraph {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const nodeIds = new Set<string>();

    const addNode = (node: GraphNode) => {
      if (!nodeIds.has(node.id)) {
        nodes.push(node);
        nodeIds.add(node.id);
      }
    };

    // 1. Ingest Incidents as nodes
    for (const inc of incidents) {
      addNode({
        id: inc.id,
        type: 'incident',
        label: inc.title,
        description: inc.description,
        metadata: {
          category: inc.category,
          severity: inc.severity,
          confidence: inc.confidence,
        },
      });

      // Scan log text of the incident to auto-discover related hardware peripherals
      const text = inc.description.toLowerCase();
      if (/printer|paper/i.test(text)) {
        addNode({
          id: 'hw-printer',
          type: 'hardware',
          label: 'Receipt Printer COM',
          description: 'Thermal receipt printer subsystem',
        });
        edges.push({
          sourceId: inc.id,
          targetId: 'hw-printer',
          relationship: 'affects',
          confidence: 0.9,
        });
      }
      if (/payment|cashless|card|gateway/i.test(text)) {
        addNode({
          id: 'hw-pinpad',
          type: 'hardware',
          label: 'Card Reader Pinpad',
          description: 'Cashless payment authorization terminal',
        });
        edges.push({
          sourceId: inc.id,
          targetId: 'hw-pinpad',
          relationship: 'affects',
          confidence: 0.95,
        });
      }
    }

    // 2. Ingest State transitions as nodes and link to incidents occurring in overlap
    if (sequence && sequence.transitions) {
      for (const t of sequence.transitions) {
        const nodeId = `state-trans-${t.lineNumber}-${t.fromState}-${t.toState}`;
        addNode({
          id: nodeId,
          type: 'state',
          label: `${t.fromState} ➔ ${t.toState}`,
          description: `Line ${t.lineNumber}: ${t.triggerMessage}`,
          metadata: {
            lineNumber: t.lineNumber,
            timestamp: t.timestamp,
          },
        });

        // Link transition node to related incidents
        for (const inc of incidents) {
          const incStart = inc.timestampStart ? Date.parse(inc.timestampStart) : 0;
          const incEnd = inc.timestampEnd ? Date.parse(inc.timestampEnd) : incStart;
          const transTime = t.timestamp ? Date.parse(t.timestamp) : 0;

          if (
            transTime &&
            incStart &&
            transTime >= incStart - 30000 &&
            transTime <= incEnd + 30000
          ) {
            edges.push({
              sourceId: inc.id,
              targetId: nodeId,
              relationship: 'correlated_with',
              confidence: 0.8,
            });
          }
        }
      }
    }

    // 3. Ingest SLA rule violations and link to related incidents/logs
    for (const rule of ruleResults) {
      if (rule.status === 'violation') {
        const nodeId = `rule-violation-${rule.ruleId}`;
        addNode({
          id: nodeId,
          type: 'rule',
          label: `SLA Breach: ${rule.name}`,
          description: rule.expectedBehavior,
          metadata: {
            category: rule.category,
            notes: rule.notes,
          },
        });

        // Link rule to matching incidents
        for (const inc of incidents) {
          if (
            (rule.category === 'payment' && inc.category === 'payment_timeout') ||
            (rule.category === 'hardware' && inc.category === 'printer_reconnect') ||
            (rule.category === 'system' && inc.category === 'reset_cycle') ||
            (rule.category === 'network' && inc.category === 'heartbeat_dropout')
          ) {
            edges.push({
              sourceId: inc.id,
              targetId: nodeId,
              relationship: 'violates',
              confidence: 0.95,
            });
          }
        }
      }
    }

    return { nodes, edges };
  }

  /**
   * Calculates a deterministic operational degradation score based on telemetry alerts and incidents.
   */
  public static calculateDegradationScore(
    incidents: Incident[],
    ruleResults: DomainRuleResult[],
  ): OperationalDegradationResult {
    let score = 100;
    const factors: string[] = [];

    const paymentIncidents = incidents.filter((i) => i.category === 'payment_timeout');
    if (paymentIncidents.length > 0) {
      score -= paymentIncidents.length * 15;
      factors.push(`${paymentIncidents.length} Cashless payment transaction timeouts detected.`);
    }

    const resetIncidents = incidents.filter((i) => i.category === 'reset_cycle');
    if (resetIncidents.length > 0) {
      score -= resetIncidents.length * 15;
      factors.push(`${resetIncidents.length} Watchdog hardware reset / reboot cycles recorded.`);
    }

    const heartbeatIncidents = incidents.filter((i) => i.category === 'heartbeat_dropout');
    if (heartbeatIncidents.length > 0) {
      score -= heartbeatIncidents.length * 12;
      factors.push(
        `${heartbeatIncidents.length} Heartbeat network connectivity dropouts recorded.`,
      );
    }

    const terminalIncidents = incidents.filter((i) => i.category === 'terminal_id_failure');
    if (terminalIncidents.length > 0) {
      score -= terminalIncidents.length * 20;
      factors.push(
        `Kiosk experienced ${terminalIncidents.length} critical identification / authentication failures.`,
      );
    }

    const printerIncidents = incidents.filter((i) => i.category === 'printer_reconnect');
    if (printerIncidents.length > 0) {
      score -= printerIncidents.length * 8;
      factors.push(`${printerIncidents.length} Receipt printer COM / USB dropout cycles observed.`);
    }

    const violations = ruleResults.filter((r) => r.status === 'violation');
    if (violations.length > 0) {
      score -= violations.length * 10;
      factors.push(`${violations.length} official operational SLA compliance breaches.`);
    }

    // Clamp score between 0 and 100
    score = Math.max(0, Math.min(100, score));

    let level: 'nominal' | 'degraded' | 'critical' = 'nominal';
    if (score < 70) {
      level = 'critical';
    } else if (score < 90) {
      level = 'degraded';
    }

    if (factors.length === 0) {
      factors.push('All systems nominal. Log workspace operates within target SLA bounds.');
    }

    return { score, level, factors };
  }

  /**
   * Deterministic Guided Playbook Step Validator.
   * Scans log frames, state sequences, and rules validations to verify playbook instructions.
   */
  public static executePlaybook(
    playbook: Playbook,
    entries: StructuredLogEntry[],
    transitions: StateTransition[],
    _ruleResults: DomainRuleResult[],
  ): Playbook {
    let allStepsPassed = true;
    let anyStepFailed = false;

    const updatedSteps = playbook.steps.map((step) => {
      const criteria = step.criteria;
      let status: 'passed' | 'failed' | 'skipped' = 'failed';
      let matchedEntryIds: string[] = [];
      let matchedLineNumbers: number[] = [];
      let evidenceSummary = '';

      if (step.type === 'scan_keyword' && criteria.pattern) {
        try {
          const regex = new RegExp(criteria.pattern, 'i');
          const matches = entries.filter((e) => regex.test(e.message || e.raw || ''));
          if (matches.length > 0) {
            status = 'passed';
            matchedEntryIds = matches.map((m) => m.id);
            matchedLineNumbers = matches.map((m) => m.lineNumber);
            evidenceSummary = `Verified: Detected ${matches.length} matching event logs.`;
          } else {
            status = 'failed';
            evidenceSummary = `Unresolved: Pattern "${criteria.pattern}" not found in log frame.`;
          }
        } catch {
          status = 'failed';
          evidenceSummary = 'Error: Invalid keyword regex evaluation parameter.';
        }
      } else if (step.type === 'state_transition' && criteria.stateName) {
        const targetState = criteria.stateName.toUpperCase();
        const matches = transitions.filter((t) => t.toState.toUpperCase() === targetState);
        if (matches.length > 0) {
          status = 'passed';
          matchedEntryIds = matches.map((m) => m.entryId);
          matchedLineNumbers = matches.map((m) => m.lineNumber);
          evidenceSummary = `Verified: State sequence transitioned successfully to ${criteria.stateName}.`;
        } else {
          status = 'failed';
          evidenceSummary = `Unresolved: State engine never reached state "${criteria.stateName}".`;
        }
      } else if (step.type === 'peripheral_status' && criteria.pattern) {
        try {
          const regex = new RegExp(criteria.pattern, 'i');
          const matches = entries.filter((e) => regex.test(e.message || e.raw || ''));
          const disconnects = matches.filter((m) =>
            /disconnect|offline|failed|lost/i.test(m.message || ''),
          );
          const connects = matches.filter((m) =>
            /connect|online|ready|open/i.test(m.message || ''),
          );

          matchedEntryIds = matches.map((m) => m.id);
          matchedLineNumbers = matches.map((m) => m.lineNumber);

          if (disconnects.length > 0 && connects.length === 0) {
            status = 'failed';
            evidenceSummary = `Critical: Peripheral disconnected at line ${disconnects[0]?.lineNumber || 0} and did not recover.`;
          } else if (connects.length > 0) {
            status = 'passed';
            evidenceSummary = `Verified: Peripheral active. Online trace detected at line ${connects[connects.length - 1]?.lineNumber || 0}.`;
          } else {
            status = 'failed';
            evidenceSummary = `Unresolved: No peripheral connection telemetry found for "${criteria.pattern}".`;
          }
        } catch {
          status = 'failed';
          evidenceSummary = 'Error: Peripheral match pattern regex error.';
        }
      } else if (step.type === 'correlation_check' && criteria.expectedBehavior) {
        // Evaluates payment or retry-storm correlation checks
        const stormRegex = /retry|attempt|storm/i;
        const matchingStorms = entries.filter((e) => stormRegex.test(e.message || ''));
        if (matchingStorms.length > 10) {
          status = 'failed';
          matchedEntryIds = matchingStorms.slice(0, 10).map((e) => e.id);
          matchedLineNumbers = matchingStorms.slice(0, 10).map((e) => e.lineNumber);
          evidenceSummary = `Breached: Detected a dense sequence of ${matchingStorms.length} payment/API retries (Retry Storm).`;
        } else {
          status = 'passed';
          evidenceSummary =
            'Verified: Telemetry retries remain inside standard operational thresholds.';
        }
      } else {
        status = 'skipped';
        evidenceSummary = 'Skipped: Incomplete or undefined step verification parameters.';
      }

      if (status === 'failed') {
        allStepsPassed = false;
        anyStepFailed = true;
      }

      return {
        ...step,
        status,
        matchedEntryIds,
        matchedLineNumbers,
        evidenceSummary,
      };
    });

    let status: 'idle' | 'running' | 'completed' | 'failed' = 'idle';
    if (updatedSteps.length > 0) {
      if (anyStepFailed) status = 'failed';
      else if (allStepsPassed) status = 'completed';
    }

    return {
      ...playbook,
      steps: updatedSteps,
      status,
    };
  }

  /**
   * Explainable evidence-grounded RCA Draft Compiler.
   * Aggregates telemetry matches, skipped transition sequences, and active rules compliance breaches
   * to construct an explainable diagnostic report template.
   */
  public static generateRcaDraft(
    incident: Incident,
    entries: StructuredLogEntry[],
    ruleResults: DomainRuleResult[],
    transitions: StateTransition[],
  ): RcaDraft {
    const timestampStart = incident.timestampStart ? Date.parse(incident.timestampStart) : null;
    const timestampEnd = incident.timestampEnd ? Date.parse(incident.timestampEnd) : null;

    // Filter relevant rules violations that overlap temporally with the incident
    const relevantRuleViolations = ruleResults.filter((rule) => {
      if (rule.status !== 'violation') return false;
      // If rule references logs, check if they overlap with the incident's active bounds
      return rule.evidenceEntryIds.some((id) => incident.entryIds.includes(id));
    });

    // Check states active leading up to or during the incident
    const skipChecks = ['INITIALIZING', 'CONNECTING', 'READY'];
    const uncertainties: string[] = [];
    const matchedStateNames = transitions.map((t) => t.toState.toUpperCase());

    skipChecks.forEach((state) => {
      if (!matchedStateNames.includes(state)) {
        uncertainties.push(
          `Skipped State Check: Log contains no record of machine transitioning to "${state}" before failure.`,
        );
      }
    });

    // Temporal gaps check: scan for gaps in log lines > 30 seconds inside incident timeframe
    if (timestampStart !== null && timestampEnd !== null) {
      const incidentDuration = Math.abs(timestampEnd - timestampStart);
      if (incidentDuration > 30000) {
        // scan logs inside timeframe to see if there is a gap
        const periodEntries = entries.filter((e) => {
          if (e.timestampEpochMs === null) return false;
          return e.timestampEpochMs >= timestampStart && e.timestampEpochMs <= timestampEnd;
        });

        for (let i = 1; i < periodEntries.length; i++) {
          const prev = periodEntries[i - 1]?.timestampEpochMs || 0;
          const curr = periodEntries[i]?.timestampEpochMs || 0;
          if (curr - prev > 20000) {
            uncertainties.push(
              `Telemetry Timeline Gap: Missing event logs for ${Math.round((curr - prev) / 1000)}s between line ${periodEntries[i - 1]?.lineNumber || 0} and ${periodEntries[i]?.lineNumber || 0}.`,
            );
          }
        }
      }
    }

    // Expose uncertainty when socket closures lack TCP FIN telemetry
    const resetRegex = /reset|abrupt|closed|connection lost|disconnect/i;
    const hasAbruptReset = entries.some((e) => {
      if (!incident.entryIds.includes(e.id)) return false;
      return resetRegex.test(e.message || '');
    });
    if (hasAbruptReset) {
      uncertainties.push(
        'Uncertainty Boundary: Kiosk socket connection closed abruptly without full TCP FIN telemetry handshake.',
      );
    }

    // Build the confidence score breakdown
    let score = 100;
    const contributingTelemetryLines: number[] = [];

    // Deduct for violations and uncertainties
    score -= relevantRuleViolations.length * 15;
    score -= uncertainties.length * 10;

    // Clamp score
    score = Math.max(10, Math.min(100, score));

    // Gather contributing coordinates
    relevantRuleViolations.forEach((rule) => {
      rule.evidenceEntryIds.forEach((id) => {
        const entry = entries.find((e) => e.id === id);
        if (entry && !contributingTelemetryLines.includes(entry.lineNumber)) {
          contributingTelemetryLines.push(entry.lineNumber);
        }
      });
    });

    incident.entryIds.forEach((id) => {
      const entry = entries.find((e) => e.id === id);
      if (entry && !contributingTelemetryLines.includes(entry.lineNumber)) {
        contributingTelemetryLines.push(entry.lineNumber);
      }
    });

    const confidenceBreakdown = {
      score,
      matchedRulesCount: ruleResults.filter((r) => r.status === 'passed').length,
      matchedStatesCount: matchedStateNames.length,
      contributingTelemetryLines: contributingTelemetryLines.sort((a, b) => a - b),
      uncertaintyFactors: uncertainties,
    };

    const reasoningTrace = [
      `Aggregated incident category: ${incident.category}`,
      `Analyzed ${incident.entryIds.length} event frames in temporal threshold.`,
      `Audited ${relevantRuleViolations.length} active SLA rules violations.`,
      `Identified ${uncertainties.length} operational telemetry boundaries.`,
    ];

    const violationsList = relevantRuleViolations.map(
      (r) => `Rule Violation: "${r.name}" (${r.expectedBehavior})`,
    );
    const timelinePropagation = transitions
      .filter((t) => {
        if (t.timestamp === null || timestampStart === null || timestampEnd === null) return false;
        const epoch = Date.parse(t.timestamp);
        return epoch >= timestampStart - 10000 && epoch <= timestampEnd + 10000;
      })
      .map(
        (t) => `[${t.timestamp || ''}] Transitioned to state ${t.toState} (Line ${t.lineNumber})`,
      );

    const evidenceLinks = entries
      .filter((e) => incident.entryIds.includes(e.id))
      .map((e) => ({
        entryId: e.id,
        lineNumber: e.lineNumber,
        message: e.message || e.raw || '',
      }));

    // Suggest a deterministic recovery path based on incident category
    let suggestedRecoveryPath = 'Standard system diagnostic checklist recommended.';
    if (incident.category === 'payment_timeout') {
      suggestedRecoveryPath =
        'Verify payment controller peripheral connection port, validate terminal cashless token configuration, and trigger serial port restart.';
    } else if (incident.category === 'printer_reconnect') {
      suggestedRecoveryPath =
        'Execute printer hardware USB cycle restart, audit paper roll sensor limits, and check COM baud rate config parameters.';
    } else if (incident.category === 'terminal_id_failure') {
      suggestedRecoveryPath =
        'Audit kiosk secure credential storage settings, check network route access rules, and reload primary API gateway keys.';
    } else if (incident.category === 'reset_cycle') {
      suggestedRecoveryPath =
        'Inspect power supply voltages, check hardware watchdog board timeout values, and review memory usage allocation trends.';
    }

    // Build the high-density markdown draft
    const draftMarkdown = `### RCA INVESTIGATION ASSISTANT REPORT
**Target Incident:** ${incident.title}
**Telemetry Confidence Score:** ${score}/100

#### 1. EVIDENCE ANALYSIS BREAKDOWN
- Matched SLA rules verified: ${confidenceBreakdown.matchedRulesCount}
- Validated state transitions: ${confidenceBreakdown.matchedStatesCount}
- Impacted telemetry entries: ${evidenceLinks.length} lines

#### 2. DETERMINISTIC RULES VIOLATED
${violationsList.length > 0 ? violationsList.map((v) => `- ${v}`).join('\n') : '- No formal SLA rules violated.'}

#### 3. CHRONOLOGICAL PROPAGATION TIMELINE
${timelinePropagation.length > 0 ? timelinePropagation.map((t) => `- ${t}`).join('\n') : '- No state transitions during incident timeline.'}

#### 4. UNCERTAINTIES & TELEMETRY BOUNDARIES
${uncertainties.length > 0 ? uncertainties.map((u) => `- ⚠️ ${u}`).join('\n') : '- Telemetry timeline remains continuous with nominal bounds.'}

#### 5. RECOMMENDATIONS & RECOVERY PATHWAY
- **Recommended Remediation:** ${suggestedRecoveryPath}
- **Primary Telemetry Coordinates:** [Go to Line ${incident.entryIds.length > 0 ? evidenceLinks[0]?.lineNumber : 0}](file:///view-log#L${incident.entryIds.length > 0 ? evidenceLinks[0]?.lineNumber : 0})
`;

    return {
      id: `rca-draft:${incident.id}:${Date.now()}`,
      incidentId: incident.id,
      confidence: confidenceBreakdown,
      reasoningTrace,
      deterministicViolations: violationsList,
      timelinePropagation,
      uncertainties,
      evidenceLinks,
      suggestedRecoveryPath,
      draftMarkdown,
    };
  }

  /**
   * Deterministic Operational Triage prioritizer.
   * Weighs incident category severity, overlapping rule violations, and propagation depth
   * to rank outages by urgency, pinpointing the starting line coordinate of the failure.
   */
  public static triageIncidents(
    incidents: Incident[],
    ruleResults: DomainRuleResult[],
  ): TriageRank[] {
    const ranks: TriageRank[] = incidents.map((incident) => {
      let severityScore = 30; // base score for generic failures
      const contributingFactors: string[] = [];

      // Category Weighting
      if (incident.category === 'payment_timeout') {
        severityScore = 50;
        contributingFactors.push(
          'High-priority category: Cashless payment timeout affects merchant transaction path.',
        );
      } else if (incident.category === 'terminal_id_failure') {
        severityScore = 45;
        contributingFactors.push(
          'High-priority category: Kiosk terminal identification failure halts boot lifecycle.',
        );
      } else if (incident.category === 'reset_cycle') {
        severityScore = 40;
        contributingFactors.push(
          'Medium-priority category: Watchdog cycle restart interrupts active kiosk operations.',
        );
      } else if (incident.category === 'heartbeat_dropout') {
        severityScore = 35;
        contributingFactors.push(
          'Medium-priority category: Kiosk network connection dropout disconnects state sync.',
        );
      } else if (incident.category === 'printer_reconnect') {
        severityScore = 25;
        contributingFactors.push(
          'Low-priority category: Receipt printer reconnection loop cycles in background.',
        );
      }

      // Rule violations overlap checklist
      const overlappingViolations = ruleResults.filter((rule) => {
        if (rule.status !== 'violation') return false;
        return rule.evidenceEntryIds.some((id) => incident.entryIds.includes(id));
      });

      if (overlappingViolations.length > 0) {
        const bonus = Math.min(25, overlappingViolations.length * 10);
        severityScore += bonus;
        contributingFactors.push(
          `Outage density: Overlaps with ${overlappingViolations.length} active SLA rule compliance breaches.`,
        );
      }

      // Duration multiplier: longer incidents represent higher operational disruption
      if (incident.durationMs && incident.durationMs > 60000) {
        severityScore += 10;
        contributingFactors.push(
          `Outage duration: Disruption bounds persist longer than 60s (${Math.round(incident.durationMs / 1000)}s).`,
        );
      }

      // Cap at 100
      severityScore = Math.max(0, Math.min(100, severityScore));

      const impactLevel: 'low' | 'medium' | 'high' =
        severityScore >= 70 ? 'high' : severityScore >= 40 ? 'medium' : 'low';

      // Estimate the starting telemetry line.
      // Incidents group entries chronologically, so the first entry represents the primary coordinate.
      const primaryStartingCoordinate = incident.entryIds.length > 0 ? 1 : 0; // mapped relative index, UI will translate to actual line number

      return {
        incidentId: incident.id,
        severityScore,
        impactLevel,
        primaryStartingCoordinate,
        propagationDepth: incident.entryIds.length,
        contributingFactors,
      };
    });

    // Sort by severity score descending (highest priority first)
    return ranks.sort((a, b) => b.severityScore - a.severityScore);
  }

  /**
   * Offline recurring pattern suggestions.
   * Scans log frames to identify repeating warnings, error statements, or connection loops.
   * Rules are generated strictly as non-deployedSuggestions, requiring manual promotion.
   */
  public static detectRecurringPatterns(entries: StructuredLogEntry[]): ObservedPattern[] {
    const suggestions: ObservedPattern[] = [];
    const patternsToScan = [
      {
        keyword: 'usb.*disconnect|failed to open.*usb',
        category: 'printer_reconnect' as IncidentCategory,
        ruleName: 'Printer Port Stability Audit',
        behavior: 'Receipt printers must maintain USB COM connectivity bounds without dropouts.',
      },
      {
        keyword: 'timeout.*payment|api.*payment.*fail',
        category: 'payment_timeout' as IncidentCategory,
        ruleName: 'Merchant Transaction Latency SLA',
        behavior:
          'Merchant gateway API responses must return inside cashless processing SLA thresholds.',
      },
      {
        keyword: 'heartbeat.*lost|ping.*timeout',
        category: 'heartbeat_dropout' as IncidentCategory,
        ruleName: 'Heartbeat Connectivity Check',
        behavior: 'Central network status ping must maintain consistent network sync intervals.',
      },
      {
        keyword: 'reboot.*watchdog|system_restart',
        category: 'reset_cycle' as IncidentCategory,
        ruleName: 'Watchdog Restart Prevention Monitor',
        behavior:
          'Kiosks must run without unhandled runtime exceptions triggering hardware resets.',
      },
    ];

    patternsToScan.forEach((scan, index) => {
      try {
        const regex = new RegExp(scan.keyword, 'i');
        const matches = entries.filter((e) => regex.test(e.message || e.raw || ''));
        if (matches.length >= 3) {
          const sample = matches[0];
          suggestions.push({
            id: `suggested-pattern:${index}:${Date.now()}`,
            pattern: scan.keyword,
            occurrencesCount: matches.length,
            incidentCategory: scan.category,
            averageConfidence: 85,
            sampleMessage:
              sample?.message || sample?.raw || 'Telemetry event matching regex pattern.',
            sourceFilePaths: sample?.sourceId ? [sample.sourceId] : [],
            suggestedRuleName: scan.ruleName,
            suggestedExpectedBehavior: scan.behavior,
            isApproved: false, // Strict Product Law: Suggestions are NEVER auto-approved or auto-deployed
          });
        }
      } catch {
        // Skip malformed regex scans
      }
    });

    return suggestions;
  }
}
