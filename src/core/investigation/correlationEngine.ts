import type {
  Incident,
  IncidentCategory,
  StateTransition,
  StateTransitionSequence,
  DomainRuleResult,
  FailureChainCandidate,
} from '@shared/contracts/investigations';
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
  public static detectIncidents(sourceId: string, entries: StructuredLogEntry[]): Incident[] {
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
}
