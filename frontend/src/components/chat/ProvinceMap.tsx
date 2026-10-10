import { AlertTriangle } from 'lucide-react'
import { useId, useState } from 'react'
import { formatValue, type MapChartSpec } from '@/chat/chartSpec'
import { colorScale } from '@/chat/charts/colorScale'
import { MAP_VIEWBOX, PROVINCE_SHAPES } from '@/chat/charts/provinceShapes'

type Region = MapChartSpec['regions'][number]

/** Provinces and territories coloured by value, light to dark (#82). A province without a
 * value is hatched grey and says "No data", so it never reads as the lowest value. Hover or
 * focus a province for its value; the switch above offers the same data ranked as bars, and
 * "Show as table" lists it. */
export function ProvinceMap({ spec }: { spec: MapChartSpec }) {
  const hatch = useId()
  const [active, setActive] = useState<Region | null>(null)
  const scale = colorScale(
    spec.regions.flatMap((r) => (r.value === null ? [] : [r.value])),
  )
  const decimals = Math.max(...spec.regions.map((r) => r.decimals))
  const hasNoData = spec.regions.some((r) => r.value === null)
  const format = (value: number | null, places = decimals) =>
    formatValue(value, spec.unit, places)
  // Short forms (43K, 3.3M) keep the legend scannable; hover and the table give exact values.
  const legendValue = (value: number) =>
    formatValue(value, spec.unit, decimals, true)

  return (
    <div className="space-y-2">
      <svg
        viewBox={MAP_VIEWBOX}
        role="img"
        aria-label={`Map: ${spec.title}, by province and territory`}
        className="mx-auto block max-h-80 w-full"
      >
        <defs>
          <pattern
            id={hatch}
            patternUnits="userSpaceOnUse"
            width="6"
            height="6"
            patternTransform="rotate(45)"
          >
            <rect width="6" height="6" fill="var(--muted)" />
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="6"
              stroke="var(--muted-foreground)"
              strokeOpacity="0.35"
              strokeWidth="2"
            />
          </pattern>
        </defs>
        {spec.regions.map((region) => (
          <path
            key={region.code}
            d={PROVINCE_SHAPES[region.code]}
            fill={
              region.value === null
                ? `url(#${hatch})`
                : scale.colorOf(region.value)
            }
            // The surface colour between provinces keeps neighbours apart.
            stroke={
              active?.code === region.code
                ? 'var(--foreground)'
                : 'var(--background)'
            }
            strokeWidth={active?.code === region.code ? 1.5 : 0.75}
            tabIndex={0}
            aria-label={`${region.name}: ${region.value === null ? 'No data' : format(region.value, region.decimals)}`}
            onMouseEnter={() => setActive(region)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(region)}
            onBlur={() => setActive(null)}
            className="cursor-default outline-none"
          />
        ))}
      </svg>

      {/* What's under the pointer, or Canada's value as the reference. */}
      <p className="min-h-5 text-center text-sm" aria-live="polite">
        {active ? (
          <>
            <span className="text-muted-foreground">{active.name}: </span>
            <strong>
              {active.value === null
                ? 'No data'
                : format(active.value, active.decimals)}
            </strong>
            {active.value !== null && active.flags.length > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
                <AlertTriangle className="size-3" aria-hidden />
                {active.flags.join('; ')}
              </span>
            )}
          </>
        ) : spec.national ? (
          <>
            <span className="text-muted-foreground">Canada: </span>
            <strong>
              {format(spec.national.value, spec.national.decimals)}
            </strong>
          </>
        ) : (
          <span className="text-muted-foreground">
            Hover over a province or territory for its value.
          </span>
        )}
      </p>

      <ul
        aria-label="Legend"
        className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-muted-foreground"
      >
        {scale.steps.map((step) => (
          <li key={step.color} className="flex items-center gap-1.5">
            <Swatch fill={step.color} />
            {step.from === step.to
              ? legendValue(step.from)
              : `${legendValue(step.from)}–${legendValue(step.to)}`}
          </li>
        ))}
        {hasNoData && (
          <li className="flex items-center gap-1.5">
            <svg className="size-3 rounded-sm" aria-hidden>
              <rect width="12" height="12" fill={`url(#${hatch})`} />
            </svg>
            No data
          </li>
        )}
      </ul>
    </div>
  )
}

function Swatch({ fill }: { fill: string }) {
  return (
    <span
      aria-hidden
      className="inline-block size-3 rounded-sm"
      style={{ background: fill }}
    />
  )
}
