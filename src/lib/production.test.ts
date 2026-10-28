import { describe, expect, it } from "vitest";
import { demoSnapshot } from "./demo-data";
import {
  isValidOperatorPin,
  isValidOperatorRegistration,
  normalizeOperatorPin,
  normalizeOperatorRegistration,
  operatorPinLength,
  operatorRegistrationLength,
} from "./operator-credentials";
import {
  assertProdNotDuplicatedInFreight,
  assertRoutePositionsAreUnique,
  calculateStageProductivity,
  calculateDashboardMetrics,
  canManagePermissions,
  ensureUniqueContractNumber,
  ensureUniqueProdNumber,
  filterReports,
  formatProdIdentification,
  generateRouteReport,
  groupProdNumbersForStop,
  moveStop,
  validateFreightValues,
} from "./production";
import { currentProductiveSeconds, formatDurationClock } from "./pointing";
import { buildPausedIntervals, sumMergedIntervalSeconds } from "./pointing-productivity";
import { buildProductionProductivityReport } from "./productivity-report";
import { prodSchema } from "./schemas";
import { POINTING_ACTIONS } from "./types";

describe("production domain rules", () => {
  it("gera a identificação visual da PROD", () => {
    const client = demoSnapshot.clients[0];
    const contract = demoSnapshot.contracts[0];
    const prod = demoSnapshot.prods[1];

    expect(formatProdIdentification(client, contract, prod)).toBe(
      "João da Silva - 26-0064 - PROD 2",
    );
  });

  it("impede PROD duplicada dentro do mesmo contrato", () => {
    expect(ensureUniqueProdNumber(demoSnapshot.prods, "contract-260064", "2")).toBe(
      false,
    );
    expect(ensureUniqueProdNumber(demoSnapshot.prods, "contract-260064", "5")).toBe(
      true,
    );
    expect(ensureUniqueProdNumber(demoSnapshot.prods, "contract-260072", "2")).toBe(
      true,
    );
    const prods = [...demoSnapshot.prods, { ...demoSnapshot.prods[0], id: "prod-max", prod_number: "1-MAX" }];
    expect(ensureUniqueProdNumber(prods, "contract-260064", "1-MAX")).toBe(false);
    expect(ensureUniqueProdNumber(prods, "contract-260072", "1-MAX")).toBe(true);
  });

  it("aceita identificações de PROD numéricas ou com sufixo e remove espaços externos", () => {
    const contract_id = "00000000-0000-4000-8000-000000000001";
    expect(prodSchema.parse({ contract_id, prod_number: " 1-MAX " }).prod_number).toBe("1-MAX");
    expect(prodSchema.parse({ contract_id, prod_number: "2" }).prod_number).toBe("2");
    expect(prodSchema.safeParse({ contract_id, prod_number: "   " }).success).toBe(false);
  });

  it("ordena as identificações de PROD no agrupamento do frete", () => {
    const snapshot = structuredClone(demoSnapshot);
    snapshot.prods[0].prod_number = "10";
    snapshot.prods[1].prod_number = "1-MAX";
    snapshot.prods[2].prod_number = "2";
    snapshot.freightStops[0].prod_ids = ["prod-260064-1", "prod-260064-2", "prod-260064-3"];
    expect(groupProdNumbersForStop(snapshot.freightStops[0], snapshot)[0]).toContain(
      "PROD 1-MAX e PROD 2 e PROD 10",
    );
  });

  it("impede número de contrato duplicado", () => {
    expect(ensureUniqueContractNumber(demoSnapshot.contracts, "26-0064")).toBe(
      false,
    );
    expect(ensureUniqueContractNumber(demoSnapshot.contracts, "26-0099")).toBe(
      true,
    );
  });

  it("calcula indicadores principais do dashboard", () => {
    const metrics = calculateDashboardMetrics(demoSnapshot);

    expect(metrics.prodsInProgress).toBe(2);
    expect(metrics.prodsAwaitingMaterials).toBe(3);
    expect(metrics.freightValues.expected).toBe(1200);
  });

  it("não multiplica intervalos produtivos sobrepostos", () => {
    const eventAt = "2026-07-21T13:00:00.000Z";
    const snapshot = {
      ...demoSnapshot,
      pointingSessions: [],
      prodPieces: [
        {
          id: "piece-a",
          company_id: "company-demo",
          prod_id: "prod-260064-2",
          piece_code: "A",
          system_code: null,
          system_description: null,
          quantity: 1,
          width_mm: null,
          height_mm: null,
          measure_a: null,
          measure_b: null,
          location: null,
          area_m2: 1,
          unit_weight_kg: 10,
          total_weight_kg: 10,
          source: "manual",
          import_batch_id: null,
          released_to_production: true,
          released_at: eventAt,
          released_by: "user-master",
          sort_order: 1,
          notes: null,
          created_by: null,
          created_at: eventAt,
          updated_at: eventAt,
        },
        {
          id: "piece-b",
          company_id: "company-demo",
          prod_id: "prod-260064-2",
          piece_code: "B",
          system_code: null,
          system_description: null,
          quantity: 1,
          width_mm: null,
          height_mm: null,
          measure_a: null,
          measure_b: null,
          location: null,
          area_m2: 1,
          unit_weight_kg: 20,
          total_weight_kg: 20,
          source: "manual",
          import_batch_id: null,
          released_to_production: true,
          released_at: eventAt,
          released_by: "user-master",
          sort_order: 2,
          notes: null,
          created_by: null,
          created_at: eventAt,
          updated_at: eventAt,
        },
      ],
      prodPieceStages: ["piece-a", "piece-b"].map((pieceId) => ({
        id: `piece-stage-${pieceId}`,
        company_id: "company-demo",
        prod_id: "prod-260064-2",
        piece_id: pieceId,
        stage_id: "stage-cutting",
        status: "concluida" as const,
        started_at: "2026-07-21T12:00:00.000Z",
        completed_at: eventAt,
        total_productive_seconds: 3600,
        total_paused_seconds: 0,
        current_operator_id: "operator-1",
        last_action: "concluir" as const,
        last_action_at: eventAt,
        load_volume_count: 0,
        load_checklist: {},
        load_checked_at: null,
        load_checked_by: null,
        active_rework_id: null,
        notes: null,
        blockers: null,
        created_at: eventAt,
        updated_at: eventAt,
      })),
      stageTimeEntries: ["piece-a", "piece-b"].map((pieceId, index) => ({
        id: `entry-${pieceId}`,
        company_id: "company-demo",
        pointing_session_id: null,
        pointing_reason_id: null,
        rework_id: null,
        prod_id: "prod-260064-2",
        piece_id: pieceId,
        stage_id: "stage-cutting",
        piece_stage_id: `piece-stage-${pieceId}`,
        operator_id: "operator-1",
        session_profile_id: "profile-master",
        auth_user_id: "user-master",
        action: "concluir" as const,
        event_at: index === 0 ? eventAt : "2026-07-21T13:30:00.000Z",
        productive_seconds_delta: 3600,
        paused_seconds_delta: 0,
        notes: null,
        pause_reason: null,
        created_at: eventAt,
      })),
    };

    const cutting = calculateStageProductivity(snapshot).find(
      (item) => item.stage.id === "stage-cutting",
    );

    expect(cutting?.productiveSeconds).toBe(5400);
    expect(cutting?.completedPieces).toBe(2);
    expect(cutting?.completedWeightKg).toBe(30);
    expect(cutting?.kgPerHour).toBe(20);
    expect(cutting?.piecesPerHour).toBeCloseTo(1.33, 2);
  });

  it("inclui o tempo produtivo ainda em andamento no dashboard", () => {
    const eventAt = "2026-07-21T13:00:00.000Z";
    const snapshot = {
      ...demoSnapshot,
      pointingSessions: [],
      prodPieces: [
        {
          id: "active-piece",
          company_id: "company-demo",
          prod_id: "prod-260064-2",
          piece_code: "A1",
          system_code: null,
          system_description: null,
          quantity: 1,
          width_mm: null,
          height_mm: null,
          measure_a: null,
          measure_b: null,
          location: null,
          area_m2: 1,
          unit_weight_kg: 10,
          total_weight_kg: 10,
          source: "manual",
          import_batch_id: null,
          released_to_production: true,
          released_at: eventAt,
          released_by: "user-master",
          sort_order: 1,
          notes: null,
          created_by: null,
          created_at: eventAt,
          updated_at: eventAt,
        },
      ],
      prodPieceStages: [
        {
          id: "active-piece-stage",
          company_id: "company-demo",
          prod_id: "prod-260064-2",
          piece_id: "active-piece",
          stage_id: "stage-cutting",
          status: "em_andamento" as const,
          started_at: eventAt,
          completed_at: null,
          total_productive_seconds: 0,
          total_paused_seconds: 0,
          current_operator_id: "operator-1",
          last_action: "iniciar" as const,
          last_action_at: eventAt,
          load_volume_count: 0,
          load_checklist: {},
          load_checked_at: null,
          load_checked_by: null,
          active_rework_id: null,
          notes: null,
          blockers: null,
          created_at: eventAt,
          updated_at: eventAt,
        },
      ],
      stageTimeEntries: [],
    };

    const cutting = calculateStageProductivity(
      snapshot,
      new Date("2026-07-21T13:05:00.000Z").getTime(),
    ).find((item) => item.stage.id === "stage-cutting");

    expect(cutting?.productiveSeconds).toBe(300);
  });

  it("não multiplica intervalos parados sobrepostos", () => {
    const snapshot = {
      ...demoSnapshot,
      pointingSessions: [],
      stageTimeEntries: ["piece-a", "piece-b"].map((pieceId, index) => ({
        id: `paused-entry-${pieceId}`,
        company_id: "company-demo",
        pointing_session_id: null,
        pointing_reason_id: null,
        rework_id: null,
        prod_id: "prod-260064-2",
        piece_id: pieceId,
        stage_id: "stage-cutting",
        piece_stage_id: `piece-stage-${pieceId}`,
        operator_id: "operator-1",
        session_profile_id: "profile-master",
        auth_user_id: "user-master",
        action: "retomar" as const,
        event_at: index === 0 ? "2026-07-21T13:00:00.000Z" : "2026-07-21T13:30:00.000Z",
        productive_seconds_delta: 0,
        paused_seconds_delta: 3600,
        notes: null,
        pause_reason: "Aguardando material",
        created_at: "2026-07-21T13:30:00.000Z",
      })),
    };

    expect(sumMergedIntervalSeconds(buildPausedIntervals(snapshot))).toBe(5400);
  });

  it("desconta jornada e motivos que não contam como tempo parado", () => {
    const snapshot = {
      ...demoSnapshot,
      pointingSettings: {
        company_id: "company-demo",
        timezone: "America/Sao_Paulo",
        workday_start: "08:00",
        workday_end: "18:00",
        workdays: [1, 2, 3, 4, 5],
        breaks: [{ label: "Almoço", start: "12:00", end: "13:00" }],
        updated_by: null,
        created_at: "2026-07-21T12:00:00.000Z",
        updated_at: "2026-07-21T12:00:00.000Z",
      },
      pointingReasons: [
        {
          id: "reason-material",
          company_id: "company-demo",
          kind: "pausa" as const,
          label: "Aguardando material",
          description: null,
          active: true,
          counts_as_downtime: true,
          sort_order: 10,
          created_by: null,
          created_at: "2026-07-21T12:00:00.000Z",
          updated_at: "2026-07-21T12:00:00.000Z",
        },
        {
          id: "reason-lunch",
          company_id: "company-demo",
          kind: "pausa" as const,
          label: "Almoço",
          description: null,
          active: true,
          counts_as_downtime: false,
          sort_order: 20,
          created_by: null,
          created_at: "2026-07-21T12:00:00.000Z",
          updated_at: "2026-07-21T12:00:00.000Z",
        },
      ],
      pointingSessions: [],
      stageTimeEntries: [
        {
          id: "paused-entry-material",
          company_id: "company-demo",
          pointing_session_id: null,
          pointing_reason_id: "reason-material",
          rework_id: null,
          prod_id: "prod-260064-2",
          piece_id: "piece-a",
          stage_id: "stage-cutting",
          piece_stage_id: "piece-stage-a",
          operator_id: "operator-1",
          session_profile_id: "profile-master",
          auth_user_id: "user-master",
          action: "retomar" as const,
          event_at: "2026-07-21T17:30:00.000Z",
          productive_seconds_delta: 0,
          paused_seconds_delta: 10800,
          notes: null,
          pause_reason: "Aguardando material",
          created_at: "2026-07-21T17:30:00.000Z",
        },
        {
          id: "paused-entry-lunch",
          company_id: "company-demo",
          pointing_session_id: null,
          pointing_reason_id: "reason-lunch",
          rework_id: null,
          prod_id: "prod-260064-2",
          piece_id: "piece-b",
          stage_id: "stage-cutting",
          piece_stage_id: "piece-stage-b",
          operator_id: "operator-1",
          session_profile_id: "profile-master",
          auth_user_id: "user-master",
          action: "retomar" as const,
          event_at: "2026-07-21T16:00:00.000Z",
          productive_seconds_delta: 0,
          paused_seconds_delta: 3600,
          notes: null,
          pause_reason: "Almoço",
          created_at: "2026-07-21T16:00:00.000Z",
        },
      ],
    };

    expect(sumMergedIntervalSeconds(buildPausedIntervals(snapshot))).toBe(7200);
  });

  it("considera tempo parado no relatório quando o motivo vem do cadastro", () => {
    const eventAt = "2026-07-21T13:00:00.000Z";
    const snapshot = {
      ...demoSnapshot,
      productionOperators: [
        {
          id: "operator-1",
          company_id: "company-demo",
          name: "Operador Teste",
          registration: "001",
          active: true,
          notes: null,
          stage_ids: ["stage-cutting"],
          created_by: null,
          created_at: eventAt,
          updated_at: eventAt,
        },
      ],
      pointingReasons: [
        {
          id: "reason-material",
          company_id: "company-demo",
          kind: "pausa" as const,
          label: "Aguardando material",
          description: null,
          active: true,
          counts_as_downtime: true,
          sort_order: 10,
          created_by: null,
          created_at: eventAt,
          updated_at: eventAt,
        },
      ],
      pointingSessions: [],
      stageTimeEntries: [
        {
          id: "paused-entry-from-reason",
          company_id: "company-demo",
          pointing_session_id: null,
          pointing_reason_id: "reason-material",
          rework_id: null,
          prod_id: "prod-260064-2",
          piece_id: "piece-a",
          stage_id: "stage-cutting",
          piece_stage_id: "piece-stage-a",
          operator_id: "operator-1",
          session_profile_id: "profile-master",
          auth_user_id: "user-master",
          action: "retomar" as const,
          event_at: eventAt,
          productive_seconds_delta: 0,
          paused_seconds_delta: 3600,
          notes: null,
          pause_reason: null,
          created_at: eventAt,
        },
      ],
    };

    const report = buildProductionProductivityReport(snapshot);

    expect(report.metrics.pausedHours).toBe(1);
    expect(report.operatorRows[0]?.pausedSeconds).toBe(3600);
  });

  it("formata e calcula tempo produtivo de apontamento com segundos", () => {
    expect(formatDurationClock(0)).toBe("00:00:00");
    expect(formatDurationClock(65)).toBe("00:01:05");
    expect(formatDurationClock(3661)).toBe("01:01:01");

    expect(
      currentProductiveSeconds(
        {
          status: "em_andamento",
          last_action: "iniciar",
          last_action_at: "2026-07-20T12:00:00.000Z",
          total_productive_seconds: 30,
        },
        new Date("2026-07-20T12:00:45.000Z").getTime(),
      ),
    ).toBe(75);
  });

  it("limita credenciais dos operadores de apontamento", () => {
    expect(operatorRegistrationLength).toBe(3);
    expect(operatorPinLength).toBe(4);
    expect(normalizeOperatorRegistration("A1234")).toBe("123");
    expect(normalizeOperatorPin("99-876")).toBe("9987");
    expect(isValidOperatorRegistration("123")).toBe(true);
    expect(isValidOperatorRegistration("1234")).toBe(false);
    expect(isValidOperatorPin("1234")).toBe(true);
    expect(isValidOperatorPin("123")).toBe(false);
  });

  it("mantém ação administrativa para retorno de etapa", () => {
    expect(POINTING_ACTIONS).toContain("retornar");
  });

  it("ordena paradas e preserva posições únicas", () => {
    const stops = demoSnapshot.freightStops;
    const moved = moveStop(stops, "stop-coleta-vidros", -1);

    expect(moved[0].id).toBe("stop-coleta-vidros");
    expect(moved[0].position).toBe(1);
    expect(assertRoutePositionsAreUnique(moved)).toBe(true);
  });

  it("gera relatório da rota na ordem definida", () => {
    const report = generateRouteReport(
      demoSnapshot.freights[0],
      demoSnapshot.freightStops,
      demoSnapshot,
    );

    expect(report).toContain("ROTA DE ENTREGA - 15/07/2026");
    expect(report.indexOf("1ª PARADA - ENTREGA DE PROD")).toBeLessThan(
      report.indexOf("2ª PARADA - COLETA AVULSA"),
    );
    expect(report).not.toContain("Valor previsto");
  });

  it("agrupa varias PRODs na mesma parada", () => {
    const [group] = groupProdNumbersForStop(demoSnapshot.freightStops[0], demoSnapshot);

    expect(group).toBe("João da Silva - 26-0064 - PRODs PROD 2 e PROD 3");
  });

  it("detecta PROD duplicada na mesma rota", () => {
    const duplicated = [
      ...demoSnapshot.freightStops,
      {
        ...demoSnapshot.freightStops[1],
        id: "duplicada",
        position: 3,
        prod_ids: ["prod-260064-2"],
      },
    ];

    expect(assertProdNotDuplicatedInFreight(duplicated)).toBe(false);
  });

  it("bloqueia controle de permissões para não Master", () => {
    expect(canManagePermissions(demoSnapshot.profiles[0])).toBe(true);
    expect(canManagePermissions(demoSnapshot.profiles[1])).toBe(false);
  });

  it("valida valores financeiros negativos", () => {
    expect(validateFreightValues({ expected_value: -1 })).toEqual(["expected_value"]);
    expect(validateFreightValues({ expected_value: 0, realized_value: 15 })).toEqual(
      [],
    );
  });

  it("filtra relatórios por departamento solicitante", () => {
    const report = filterReports(demoSnapshot, { departmentId: "dep-supplies" });

    expect(report.totalRequests).toBe(1);
    expect(report.totalPickups).toBe(1);
  });
});
