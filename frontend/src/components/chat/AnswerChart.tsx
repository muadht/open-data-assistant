import { AlertTriangle, Table2 } from 'lucide-react'
import { useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  chartGroups,
  formatValue,
  periodLabeller,
  type BarChartSpec,
  type ChartGroup,
  type ChartSpec,
  type LineChartSpec,
} from '@/chat/chartSpec'
import type { DataResult } from '@/chat/events'
import { cn } from '@/lib/utils'
import { ProvinceMap } from './ProvinceMap'

const AXIS_TICK = { fill: 'var(--muted-foreground)', fontSize: 12 }

/** The answer's data as charts - one per unit (docs: chat/chartSpec.ts for the rules). Each
 * chart can switch to a table, which carries the same values and flags as the tooltip. */
export function AnswerChart({ results }: { results: DataResult[] }) {
  const groups = chartGroups(results)
  if (!groups.length) return null
  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <ChartCard key={group.unit} group={group} />
      ))}
    </div>
  )
}

const VIEW_LABELS: Record<ChartSpec['kind'], string> = {
  line: 'Line',
  map: 'Map',
  bar: 'Bar',
}

function ChartCard({ group }: { group: ChartGroup }) {
  const [viewIndex, setViewIndex] = useState(0)
  const [asTable, setAsTable] = useState(false)
  const spec = group.views[viewIndex] ?? group.views[0]
  return (
    <figure className="space-y-2 rounded-lg border p-3">
      <figcaption className="flex items-start justify-between gap-2 text-sm">
        <span>
          <span className="font-medium">{spec.title}</span>
          {!['Percent', 'Dollars'].includes(spec.unit) && (
            <span className="text-muted-foreground"> ({spec.unit})</span>
          )}
          {spec.kind === 'map' && (
            <span className="text-muted-foreground">
              {' '}
              · {periodLabeller([spec.refPer])(spec.refPer)}
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {group.views.length > 1 && !asTable && (
            <span
              role="group"
              aria-label="Chart type"
              className="inline-flex rounded-md border p-0.5 text-xs"
            >
              {group.views.map((view, i) => (
                <button
                  key={view.kind}
                  type="button"
                  aria-pressed={i === viewIndex}
                  onClick={() => setViewIndex(i)}
                  className={cn(
                    'rounded px-1.5 py-0.5 text-muted-foreground hover:text-foreground',
                    i === viewIndex && 'bg-muted font-medium text-foreground',
                  )}
                >
                  {VIEW_LABELS[view.kind]}
                </button>
              ))}
            </span>
          )}
          <button
            type="button"
            onClick={() => setAsTable(!asTable)}
            aria-pressed={asTable}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Table2 className="size-3.5" aria-hidden />
            {asTable ? 'Show chart' : 'Show as table'}
          </button>
        </span>
      </figcaption>
      {asTable ? (
        <ChartTable spec={spec} />
      ) : spec.kind === 'line' ? (
        <LineView spec={spec} />
      ) : spec.kind === 'map' ? (
        <ProvinceMap spec={spec} />
      ) : (
        <BarView spec={spec} />
      )}
    </figure>
  )
}

function LineView({ spec }: { spec: LineChartSpec }) {
  const label = periodLabeller(spec.rows.map((r) => r.refPer))
  const data = spec.rows.map((row) => ({
    refPer: row.refPer,
    ...Object.fromEntries(
      spec.series.map((s) => [s.key, row.values[s.key]?.value ?? null]),
    ),
  }))
  const decimals = Math.max(...spec.series.map((s) => s.decimals))
  return (
    <div className="h-60" role="img" aria-label={`Line chart: ${spec.title}`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
        >
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="refPer"
            tickFormatter={label}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: 'var(--border)' }}
            minTickGap={24}
          />
          <YAxis
            tickFormatter={(v: number) =>
              formatValue(v, spec.unit, decimals, true)
            }
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={56}
            domain={['auto', 'auto']}
          />
          <Tooltip
            cursor={{ stroke: 'var(--muted-foreground)', strokeWidth: 1 }}
            content={({ active, label: refPer }) =>
              active && typeof refPer === 'string' ? (
                <LineTooltip spec={spec} refPer={refPer} />
              ) : null
            }
          />
          {spec.series.length > 1 && (
            <Legend
              iconType="plainline"
              wrapperStyle={{ fontSize: 12, color: 'var(--foreground)' }}
            />
          )}
          {spec.series.map((s) => (
            <Line
              key={s.key}
              dataKey={s.key}
              name={s.name}
              type="monotone"
              stroke={s.color}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={false}
              activeDot={{ r: 4, stroke: 'var(--background)', strokeWidth: 2 }}
              // A suppressed or missing value breaks the line - never bridged.
              connectNulls={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function LineTooltip({
  spec,
  refPer,
}: {
  spec: LineChartSpec
  refPer: string
}) {
  const row = spec.rows.find((r) => r.refPer === refPer)
  if (!row) return null
  return (
    <div className="space-y-1 rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <p className="text-muted-foreground">{refPer}</p>
      {spec.series.map((s) => {
        const point = row.values[s.key]
        return (
          <div key={s.key}>
            <p className="flex items-center gap-2">
              <span
                className="inline-block h-0.5 w-3 rounded"
                style={{ background: s.color }}
                aria-hidden
              />
              <strong>
                {formatValue(point?.value ?? null, spec.unit, s.decimals)}
              </strong>
              <span className="text-muted-foreground">{s.name}</span>
            </p>
            <Flags flags={point?.flags ?? []} />
          </div>
        )
      })}
    </div>
  )
}

function BarView({ spec }: { spec: BarChartSpec }) {
  const decimals = Math.max(...spec.bars.map((b) => b.decimals))
  const height = Math.max(160, spec.bars.length * 28 + 32)
  return (
    <div style={{ height }} role="img" aria-label={`Bar chart: ${spec.title}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={spec.bars}
          layout="vertical"
          margin={{ top: 0, right: 16, bottom: 0, left: 0 }}
          barCategoryGap={4}
        >
          <CartesianGrid horizontal={false} stroke="var(--border)" />
          <XAxis
            type="number"
            dataKey="value"
            tickFormatter={(v: number) =>
              formatValue(v, spec.unit, decimals, true)
            }
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: 'var(--border)' }}
            width={120}
          />
          <Tooltip
            cursor={{ fill: 'var(--muted)' }}
            content={({ active, payload }) => {
              const bar = payload?.[0]?.payload as
                BarChartSpec['bars'][number] | undefined
              return active && bar ? (
                <div className="space-y-1 rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
                  <p className="text-muted-foreground">
                    {bar.name} · {bar.refPer}
                  </p>
                  <strong>
                    {formatValue(bar.value, spec.unit, bar.decimals)}
                  </strong>
                  <Flags flags={bar.flags} />
                </div>
              ) : null
            }}
          />
          <Bar
            dataKey="value"
            maxBarSize={24}
            radius={[0, 4, 4, 0]}
            isAnimationActive={false}
          >
            {spec.bars.map((bar) => (
              <Cell key={bar.key} fill={bar.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function Flags({ flags }: { flags: string[] }) {
  if (!flags.length) return null
  return (
    <p className="flex items-start gap-1 text-amber-700 dark:text-amber-400">
      <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden />
      {flags.join('; ')}
    </p>
  )
}

/** The same values as the chart, for reading exact numbers and for anyone who can't use
 * the chart (low-contrast series colours, screen readers). */
function ChartTable({ spec }: { spec: ChartSpec }) {
  const rows =
    spec.kind === 'line'
      ? spec.rows.map((row) => ({
          label: row.refPer,
          cells: spec.series.map((s) => ({
            ...(row.values[s.key] ?? { value: null, flags: ['no data'] }),
            decimals: s.decimals,
          })),
        }))
      : spec.kind === 'map'
        ? [
            ...(spec.national
              ? [{ label: 'Canada', cells: [spec.national] }]
              : []),
            ...spec.regions.map((region) => ({
              label: region.name,
              cells: [region],
            })),
          ]
        : spec.bars.map((bar) => ({
            label: `${bar.name} (${bar.refPer})`,
            cells: [bar],
          }))
  const headers =
    spec.kind === 'line' ? spec.series.map((s) => s.name) : ['Value']
  return (
    <div className="max-h-72 overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-background text-left text-muted-foreground">
          <tr>
            <th className="py-1 pr-3 font-normal">
              {spec.kind === 'line'
                ? 'Period'
                : spec.kind === 'map'
                  ? 'Province or territory'
                  : 'Series'}
            </th>
            {headers.map((h) => (
              <th key={h} className="py-1 pr-3 text-right font-normal">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-t">
              <td className="py-1 pr-3 text-muted-foreground">{row.label}</td>
              {row.cells.map((cell, i) => (
                <td key={i} className="py-1 pr-3 text-right tabular-nums">
                  {formatValue(cell.value, spec.unit, cell.decimals)}
                  {cell.flags.length > 0 && (
                    <span
                      className="ml-1 text-amber-700 dark:text-amber-400"
                      title={cell.flags.join('; ')}
                    >
                      ⚠<span className="sr-only">{cell.flags.join('; ')}</span>
                    </span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
