import type { ReactNode } from 'react'

const stepBadgeClass =
  'shrink-0 rounded-md bg-brand-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-brand-900'

export type CalculatorStepHeadingProps = {
  step: number
  children: ReactNode
  id?: string
  as?: 'h2' | 'h3' | 'h4'
  /** Default title weight; override for compact panels (e.g. results strip). */
  titleClassName?: string
  className?: string
}

export function CalculatorStepHeading({
  step,
  children,
  id,
  as: Tag = 'h3',
  titleClassName = 'text-base font-semibold text-slate-900',
  className = '',
}: CalculatorStepHeadingProps) {
  return (
    <Tag id={id} className={`mb-2 flex flex-wrap items-center gap-2 ${className}`.trim()}>
      <span className={stepBadgeClass}>Step {step}</span>
      <span className={titleClassName}>{children}</span>
    </Tag>
  )
}
