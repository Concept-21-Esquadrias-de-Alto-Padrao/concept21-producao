"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useRouter } from "next/navigation";
import type { ProductionSnapshot } from "@/lib/types";
import {
  getForecastVsDone,
  getMaterialSituation,
  getProdsByStage,
} from "@/lib/production";

const orange = "#f97316";
const charcoal = "#20242a";
const gray = "#727b86";
const green = "#15803d";
const red = "#dc2626";

export function DashboardCharts({ snapshot }: { snapshot: ProductionSnapshot }) {
  const router = useRouter();
  const byStage = getProdsByStage(snapshot);
  const materials = getMaterialSituation(snapshot);
  const forecast = getForecastVsDone(snapshot);

  return (
    <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
      <div className="rounded-md border border-border bg-card p-4 shadow-sm">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-charcoal">PRODs por etapa</h2>
          <p className="text-sm text-muted-foreground">
            Clique em uma barra para abrir a lista filtrada.
          </p>
        </div>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={byStage}
              layout="vertical"
              margin={{ left: 12, right: 16, top: 4, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
              <XAxis type="number" allowDecimals={false} stroke={gray} />
              <YAxis
                type="category"
                dataKey="label"
                width={150}
                stroke={gray}
                tick={{ fontSize: 12 }}
              />
              <Tooltip />
              <Bar
                dataKey="count"
                radius={[0, 4, 4, 0]}
                onClick={(data) => {
                  const stageId = (
                    data as { payload?: { stage?: { id?: string } } }
                  )?.payload?.stage?.id;
                  if (stageId) router.push(`/prods?stage=${stageId}`);
                }}
                cursor="pointer"
              >
                {byStage.map((item) => (
                  <Cell key={item.stage.id} fill={item.count > 0 ? orange : "#cbd5e1"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-md border border-border bg-card p-4 shadow-sm">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-charcoal">Situação dos materiais</h2>
          <p className="text-sm text-muted-foreground">
            Contagem por PROD e grupo de material.
          </p>
        </div>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={materials} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
              <XAxis dataKey="label" stroke={gray} />
              <YAxis allowDecimals={false} stroke={gray} />
              <Tooltip />
              <Bar dataKey="confirmado" stackId="a" fill={green} />
              <Bar dataKey="parcialmente_confirmado" stackId="a" fill={orange} />
              <Bar dataKey="aguardando_confirmacao" stackId="a" fill={charcoal} />
              <Bar dataKey="indisponivel" stackId="a" fill={red} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-md border border-border bg-card p-4 shadow-sm xl:col-span-2">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-charcoal">Previsão versus conclusão</h2>
          <p className="text-sm text-muted-foreground">
            Agrupamento mensal para acompanhar capacidade e entrega.
          </p>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={forecast} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="label" stroke={gray} />
              <YAxis allowDecimals={false} stroke={gray} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="previstas"
                stroke={charcoal}
                strokeWidth={3}
                dot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="concluidas"
                stroke={orange}
                strokeWidth={3}
                dot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
