import type {
  PointingAction,
  ProductionPointingReason,
  ProductionPointingSettings,
  ProductionPieceStage,
  ProductionSnapshot,
  ProductionStageTimeEntry,
} from "./types";
import { normalizeText } from "./utils";

export type EffectivePointingSession = {
  id: string;
  stageId: string;
  operatorId: string;
  participantOperatorIds: string[];
  pointingReasonId: string | null;
  pauseReason: string | null;
  action: PointingAction;
  eventAt: string;
  productiveSecondsDelta: number;
  pausedSecondsDelta: number;
  entries: ProductionStageTimeEntry[];
};

export type ProductiveInterval = {
  stageId: string;
  operatorId: string;
  startMs: number;
  endMs: number;
  session: EffectivePointingSession;
};

function contributorOperatorIds(session: Pick<EffectivePointingSession, "operatorId" | "participantOperatorIds">) {
  return Array.from(new Set([session.operatorId, ...session.participantOperatorIds].filter(Boolean)));
}

function numericSeconds(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function maxDelta(entries: ProductionStageTimeEntry[], key: "productive_seconds_delta" | "paused_seconds_delta") {
  if (!entries.length) return 0;
  return Math.max(...entries.map((entry) => numericSeconds(entry[key])));
}

function legacyBatchKey(entry: ProductionStageTimeEntry) {
  return [
    entry.operator_id,
    entry.stage_id,
    entry.action,
    entry.event_at,
    entry.session_profile_id ?? "",
    entry.auth_user_id ?? "",
    entry.pause_reason ?? "",
    entry.notes ?? "",
  ].join("|");
}

function secondsSince(value: string | null | undefined, nowMs: number) {
  if (!value) return 0;
  const startMs = Date.parse(value);
  if (!Number.isFinite(startMs)) return 0;
  const seconds = Math.floor((nowMs - startMs) / 1000);
  return seconds > 0 ? seconds : 0;
}

const defaultPointingTimeZone = "America/Sao_Paulo";
const formatterByTimeZone = new Map<string, Intl.DateTimeFormat>();

type IntervalSegment = { startMs: number; endMs: number };
type LocalDateParts = { year: number; month: number; day: number };
type LocalDateTimeParts = LocalDateParts & { hour: number; minute: number; second: number };

function safeTimeZone(value: string | null | undefined) {
  const timeZone = value || defaultPointingTimeZone;

  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(0);
    return timeZone;
  } catch {
    return defaultPointingTimeZone;
  }
}

function formatterFor(timeZone: string) {
  const existing = formatterByTimeZone.get(timeZone);
  if (existing) return existing;

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  formatterByTimeZone.set(timeZone, formatter);
  return formatter;
}

function zonedParts(ms: number, timeZone: string): LocalDateTimeParts {
  const parts = Object.fromEntries(
    formatterFor(timeZone)
      .formatToParts(new Date(ms))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

function zonedDateTimeToUtcMs(
  date: LocalDateParts,
  minutesAfterMidnight: number,
  timeZone: string,
) {
  const hour = Math.floor(minutesAfterMidnight / 60);
  const minute = minutesAfterMidnight % 60;
  const targetUtc = Date.UTC(date.year, date.month - 1, date.day, hour, minute, 0);
  let utc = targetUtc;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = zonedParts(utc, timeZone);
    const actualUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    const nextUtc = targetUtc - (actualUtc - utc);

    if (Math.abs(nextUtc - utc) < 1000) return nextUtc;
    utc = nextUtc;
  }

  return utc;
}

function nextLocalDate(date: LocalDateParts): LocalDateParts {
  const next = new Date(Date.UTC(date.year, date.month - 1, date.day + 1, 12, 0, 0));

  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  };
}

function sameLocalDate(left: LocalDateParts, right: LocalDateParts) {
  return left.year === right.year && left.month === right.month && left.day === right.day;
}

function weekday(date: LocalDateParts) {
  return new Date(Date.UTC(date.year, date.month - 1, date.day, 12, 0, 0)).getUTCDay();
}

function timeToMinutes(value: string | null | undefined, fallback: number) {
  if (!value) return fallback;
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!match) return fallback;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return fallback;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return fallback;
  return hours * 60 + minutes;
}

function subtractSegment(segment: IntervalSegment, blocked: IntervalSegment) {
  if (blocked.endMs <= segment.startMs || blocked.startMs >= segment.endMs) return [segment];

  const nextSegments: IntervalSegment[] = [];
  if (blocked.startMs > segment.startMs) {
    nextSegments.push({ startMs: segment.startMs, endMs: Math.min(blocked.startMs, segment.endMs) });
  }
  if (blocked.endMs < segment.endMs) {
    nextSegments.push({ startMs: Math.max(blocked.endMs, segment.startMs), endMs: segment.endMs });
  }
  return nextSegments;
}

function normalizedBreaks(settings: ProductionPointingSettings) {
  return settings.breaks
    .map((item) => ({
      label: item.label,
      start: timeToMinutes(item.start, Number.NaN),
      end: timeToMinutes(item.end, Number.NaN),
    }))
    .filter((item) => Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > item.start);
}

function clipToPointingCalendar(
  startMs: number,
  endMs: number,
  settings: ProductionPointingSettings | null,
): IntervalSegment[] {
  if (!settings || endMs <= startMs) return endMs > startMs ? [{ startMs, endMs }] : [];

  const timeZone = safeTimeZone(settings.timezone);
  const workStart = timeToMinutes(settings.workday_start, 8 * 60);
  const workEnd = timeToMinutes(settings.workday_end, 18 * 60);
  if (workEnd <= workStart) return [];

  const workdays = new Set(
    (settings.workdays?.length ? settings.workdays : [1, 2, 3, 4, 5])
      .map(Number)
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
  );
  const breaks = normalizedBreaks(settings);
  const endDate = zonedParts(endMs, timeZone);
  let date: LocalDateParts = zonedParts(startMs, timeZone);
  const segments: IntervalSegment[] = [];

  for (let guard = 0; guard < 3700; guard += 1) {
    if (workdays.has(weekday(date))) {
      const dayWorkStart = zonedDateTimeToUtcMs(date, workStart, timeZone);
      const dayWorkEnd = zonedDateTimeToUtcMs(date, workEnd, timeZone);
      let daySegments: IntervalSegment[] = [
        { startMs: Math.max(startMs, dayWorkStart), endMs: Math.min(endMs, dayWorkEnd) },
      ].filter((segment) => segment.endMs > segment.startMs);

      for (const item of breaks) {
        const breakStart = zonedDateTimeToUtcMs(date, item.start, timeZone);
        const breakEnd = zonedDateTimeToUtcMs(date, item.end, timeZone);
        daySegments = daySegments.flatMap((segment) =>
          subtractSegment(segment, { startMs: breakStart, endMs: breakEnd }),
        );
      }

      segments.push(...daySegments);
    }

    if (sameLocalDate(date, endDate)) break;
    date = nextLocalDate(date);
  }

  return segments;
}

function pointingReasonIndex(snapshotOrReasons: ProductionSnapshot | ProductionPointingReason[]) {
  const pointingReasons = Array.isArray(snapshotOrReasons)
    ? snapshotOrReasons
    : snapshotOrReasons.pointingReasons;
  const byId = new Map<string, ProductionPointingReason>();
  const byLabel = new Map<string, ProductionPointingReason>();

  for (const reason of pointingReasons) {
    byId.set(reason.id, reason);
    byLabel.set(`${reason.kind}:${normalizeText(reason.label)}`, reason);
  }

  return { byId, byLabel };
}

function sessionCountsAsDowntime(
  session: EffectivePointingSession,
  reasons: ReturnType<typeof pointingReasonIndex>,
) {
  const reasonIds = [
    session.pointingReasonId,
    ...session.entries.map((entry) => entry.pointing_reason_id),
  ].filter((id): id is string => Boolean(id));

  for (const reasonId of reasonIds) {
    const reason = reasons.byId.get(reasonId);
    if (reason) return reason.counts_as_downtime !== false;
  }

  const labels = [
    session.pauseReason,
    ...session.entries.map((entry) => entry.pause_reason),
  ].filter((label): label is string => Boolean(label));

  for (const label of labels) {
    const normalizedLabel = normalizeText(label);
    const reason =
      reasons.byLabel.get(`pausa:${normalizedLabel}`) ??
      reasons.byLabel.get(`pendencia:${normalizedLabel}`);
    if (reason) return reason.counts_as_downtime !== false;
  }

  return true;
}

export function calculateAdjustedPausedSeconds({
  startMs,
  endMs,
  pointingReasonId,
  pauseReason,
  pointingReasons,
  pointingSettings,
}: {
  startMs: number;
  endMs: number;
  pointingReasonId?: string | null;
  pauseReason?: string | null;
  pointingReasons: ProductionPointingReason[];
  pointingSettings: ProductionPointingSettings | null;
}) {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 0;

  const session: EffectivePointingSession = {
    id: "display:paused",
    stageId: "",
    operatorId: "",
    participantOperatorIds: [],
    pointingReasonId: pointingReasonId ?? null,
    pauseReason: pauseReason ?? null,
    action: "retomar",
    eventAt: new Date(endMs).toISOString(),
    productiveSecondsDelta: 0,
    pausedSecondsDelta: Math.floor((endMs - startMs) / 1000),
    entries: [],
  };
  const reasons = pointingReasonIndex(pointingReasons);

  if (!sessionCountsAsDowntime(session, reasons)) return 0;

  return Math.round(
    clipToPointingCalendar(startMs, endMs, pointingSettings).reduce(
      (sum, segment) => sum + (segment.endMs - segment.startMs),
      0,
    ) / 1000,
  );
}

function lastEntryByPieceStage(entries: ProductionStageTimeEntry[]) {
  const entriesByPieceStage = new Map<string, ProductionStageTimeEntry>();

  for (const entry of entries) {
    const currentEntry = entriesByPieceStage.get(entry.piece_stage_id);
    const currentTime = currentEntry ? Date.parse(currentEntry.event_at) : Number.NEGATIVE_INFINITY;
    const entryTime = Date.parse(entry.event_at);

    if (!currentEntry || entryTime > currentTime) {
      entriesByPieceStage.set(entry.piece_stage_id, entry);
    }
  }

  return entriesByPieceStage;
}

function participantsBySessionId(snapshot: ProductionSnapshot) {
  const participantsBySession = new Map<string, string[]>();

  for (const participant of snapshot.pointingSessionParticipants) {
    const participants = participantsBySession.get(participant.pointing_session_id) ?? [];
    participants.push(participant.operator_id);
    participantsBySession.set(participant.pointing_session_id, participants);
  }

  return participantsBySession;
}

export function buildEffectivePointingSessions(snapshot: ProductionSnapshot) {
  const sessions: EffectivePointingSession[] = [];
  const knownSessionIds = new Set(snapshot.pointingSessions.map((session) => session.id));
  const participantsBySession = participantsBySessionId(snapshot);
  const entriesBySessionId = new Map<string, ProductionStageTimeEntry[]>();
  const fallbackEntries = new Map<string, ProductionStageTimeEntry[]>();

  for (const entry of snapshot.stageTimeEntries) {
    const sessionId = entry.pointing_session_id;

    if (sessionId && knownSessionIds.has(sessionId)) {
      const entries = entriesBySessionId.get(sessionId) ?? [];
      entries.push(entry);
      entriesBySessionId.set(sessionId, entries);
      continue;
    }

    const key = sessionId ? `missing:${sessionId}` : `legacy:${legacyBatchKey(entry)}`;
    const entries = fallbackEntries.get(key) ?? [];
    entries.push(entry);
    fallbackEntries.set(key, entries);
  }

  for (const session of snapshot.pointingSessions) {
    sessions.push({
      id: session.id,
      stageId: session.stage_id,
      operatorId: session.operator_id,
      participantOperatorIds: participantsBySession.get(session.id) ?? [],
      pointingReasonId: session.pointing_reason_id,
      pauseReason: session.pause_reason,
      action: session.action,
      eventAt: session.event_at,
      productiveSecondsDelta: numericSeconds(session.productive_seconds_delta),
      pausedSecondsDelta: numericSeconds(session.paused_seconds_delta),
      entries: entriesBySessionId.get(session.id) ?? [],
    });
  }

  for (const [key, entries] of fallbackEntries) {
    const firstEntry = entries[0];
    if (!firstEntry) continue;

    sessions.push({
      id: firstEntry.pointing_session_id ?? key,
      stageId: firstEntry.stage_id,
      operatorId: firstEntry.operator_id,
      participantOperatorIds: [],
      pointingReasonId: firstEntry.pointing_reason_id,
      pauseReason: firstEntry.pause_reason,
      action: firstEntry.action,
      eventAt: firstEntry.event_at,
      productiveSecondsDelta: maxDelta(entries, "productive_seconds_delta"),
      pausedSecondsDelta: maxDelta(entries, "paused_seconds_delta"),
      entries,
    });
  }

  return sessions.sort((left, right) => left.eventAt.localeCompare(right.eventAt));
}

function activeOperatorId(
  pieceStage: ProductionPieceStage,
  entriesByPieceStage: Map<string, ProductionStageTimeEntry>,
) {
  return pieceStage.current_operator_id ?? entriesByPieceStage.get(pieceStage.id)?.operator_id ?? null;
}

export function buildProductiveIntervals(snapshot: ProductionSnapshot, nowMs = Date.now()) {
  const entriesByPieceStage = lastEntryByPieceStage(snapshot.stageTimeEntries);
  const participantsBySession = participantsBySessionId(snapshot);
  const closedIntervals = buildEffectivePointingSessions(snapshot).flatMap((session) => {
    const productiveSeconds = Math.max(0, numericSeconds(session.productiveSecondsDelta));
    const endMs = Date.parse(session.eventAt);

    if (!productiveSeconds || !Number.isFinite(endMs)) return [];

    return [
      ...contributorOperatorIds(session).map((operatorId) => ({
        stageId: session.stageId,
        operatorId,
        startMs: endMs - productiveSeconds * 1000,
        endMs,
        session,
      })),
    ];
  });

  const activeIntervals = snapshot.prodPieceStages.flatMap((pieceStage) => {
    const action = pieceStage.last_action;

    if (pieceStage.status !== "em_andamento" || (action !== "iniciar" && action !== "retomar")) {
      return [];
    }

    const entry = entriesByPieceStage.get(pieceStage.id);
    const operatorId = activeOperatorId(pieceStage, entriesByPieceStage);
    const startMs = Date.parse(pieceStage.last_action_at ?? "");
    const runningSeconds = secondsSince(pieceStage.last_action_at, nowMs);

    if (!operatorId || !runningSeconds || !Number.isFinite(startMs)) return [];

    const activeSession = {
      id: `active:${pieceStage.id}`,
      stageId: pieceStage.stage_id,
      operatorId,
      participantOperatorIds: entry?.pointing_session_id
        ? participantsBySession.get(entry.pointing_session_id) ?? []
        : [],
      pointingReasonId: null,
      pauseReason: null,
      action,
      eventAt: new Date(nowMs).toISOString(),
      productiveSecondsDelta: runningSeconds,
      pausedSecondsDelta: 0,
      entries: [],
    };

    return contributorOperatorIds(activeSession).map((contributorId) => ({
        stageId: pieceStage.stage_id,
        operatorId: contributorId,
        startMs,
        endMs: nowMs,
        session: activeSession,
    }));
  });

  return [...closedIntervals, ...activeIntervals];
}

export function buildPausedIntervals(
  snapshot: ProductionSnapshot,
  nowMs = Date.now(),
  options: { includeActive?: boolean } = {},
) {
  const entriesByPieceStage = lastEntryByPieceStage(snapshot.stageTimeEntries);
  const participantsBySession = participantsBySessionId(snapshot);
  const reasons = pointingReasonIndex(snapshot);
  const closedIntervals = buildEffectivePointingSessions(snapshot).flatMap((session) => {
    const pausedSeconds = Math.max(0, numericSeconds(session.pausedSecondsDelta));
    const endMs = Date.parse(session.eventAt);

    if (!pausedSeconds || !Number.isFinite(endMs) || !sessionCountsAsDowntime(session, reasons)) {
      return [];
    }

    const startMs = endMs - pausedSeconds * 1000;
    const segments = clipToPointingCalendar(startMs, endMs, snapshot.pointingSettings);

    return contributorOperatorIds(session).flatMap((operatorId) =>
      segments.map((segment) => ({
        stageId: session.stageId,
        operatorId,
        startMs: segment.startMs,
        endMs: segment.endMs,
        session,
      })),
    );
  });

  const activeIntervals = options.includeActive === false ? [] : snapshot.prodPieceStages.flatMap((pieceStage) => {
    const action = pieceStage.last_action;

    if (
      !["pausada", "com_pendencia"].includes(pieceStage.status) ||
      (action !== "pausar" && action !== "pendencia")
    ) {
      return [];
    }

    const entry = entriesByPieceStage.get(pieceStage.id);
    const operatorId = activeOperatorId(pieceStage, entriesByPieceStage);
    const startMs = Date.parse(pieceStage.last_action_at ?? "");
    const pausedSeconds = secondsSince(pieceStage.last_action_at, nowMs);

    if (!operatorId || !pausedSeconds || !Number.isFinite(startMs)) return [];

    const activeSession = {
      id: `paused:${pieceStage.id}`,
      stageId: pieceStage.stage_id,
      operatorId,
      participantOperatorIds: entry?.pointing_session_id
        ? participantsBySession.get(entry.pointing_session_id) ?? []
        : [],
      pointingReasonId: entry?.pointing_reason_id ?? null,
      pauseReason: entry?.pause_reason ?? pieceStage.blockers ?? null,
      action,
      eventAt: new Date(nowMs).toISOString(),
      productiveSecondsDelta: 0,
      pausedSecondsDelta: pausedSeconds,
      entries: entry ? [entry] : [],
    };

    if (!sessionCountsAsDowntime(activeSession, reasons)) return [];

    const segments = clipToPointingCalendar(startMs, nowMs, snapshot.pointingSettings);

    return contributorOperatorIds(activeSession).flatMap((contributorId) =>
      segments.map((segment) => ({
        stageId: pieceStage.stage_id,
        operatorId: contributorId,
        startMs: segment.startMs,
        endMs: segment.endMs,
        session: activeSession,
      })),
    );
  });

  return [...closedIntervals, ...activeIntervals];
}

export function sumMergedIntervalSeconds(intervals: ProductiveInterval[]) {
  const sortedIntervals = intervals
    .filter((interval) => interval.endMs > interval.startMs)
    .slice()
    .sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs);

  let totalMs = 0;
  let currentStart: number | null = null;
  let currentEnd: number | null = null;

  for (const interval of sortedIntervals) {
    if (currentStart == null || currentEnd == null) {
      currentStart = interval.startMs;
      currentEnd = interval.endMs;
      continue;
    }

    if (interval.startMs <= currentEnd) {
      currentEnd = Math.max(currentEnd, interval.endMs);
      continue;
    }

    totalMs += currentEnd - currentStart;
    currentStart = interval.startMs;
    currentEnd = interval.endMs;
  }

  if (currentStart != null && currentEnd != null) {
    totalMs += currentEnd - currentStart;
  }

  return Math.round(totalMs / 1000);
}
