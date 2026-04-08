import { AMENITY_VALUATION_DEFAULTS } from '../lib/amenityValuation'
import { SQFT_RENT_ELASTICITY, getTypicalSqftForBedrooms } from '../lib/sqftMarketAdjustment'

const tocLinkClass =
  'text-brand-700 underline decoration-brand-700/35 underline-offset-2 hover:decoration-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2 rounded'

const sectionTitleClass = 'scroll-mt-24 text-xl font-semibold tracking-tight text-slate-900'

const bodyClass = 'max-w-2xl text-base leading-relaxed text-slate-600'

const codeBlockClass =
  'mt-3 block rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono text-xs leading-relaxed text-slate-800 md:text-sm'

export const MethodologyPage = () => {
  return (
    <article className="app-surface space-y-12 p-6 text-slate-700 md:p-8">
      <header className="space-y-4 border-b border-slate-200/80 pb-8">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">How we calculate your numbers</h1>
        <div className={`${bodyClass} space-y-4`}>
          <p>
            FairRent combines <strong>published average rents</strong> with <strong>your inputs</strong> to estimate
            what similar homes tend to rent for in your area, then shows optional context on the chart.
          </p>
          <p>
            <strong>This page is not legal advice.</strong> It explains the math so you can see how results are built.
          </p>
        </div>
      </header>

      <nav
        aria-labelledby="toc-title"
        className="rounded-xl border border-slate-200 bg-slate-50/80 p-5 shadow-sm"
      >
        <h2 id="toc-title" className="text-lg font-semibold text-slate-900">
          On this page
        </h2>
        <ul className="mt-4 space-y-2 text-base">
          <li>
            <a href="#overview" className={tocLinkClass}>
              1. How the estimate is built
            </a>
          </li>
          <li>
            <a href="#renters" className={tocLinkClass}>
              2. Market reference and chart bands
            </a>
          </li>
          <li>
            <a href="#amenities" className={tocLinkClass}>
              3. Parking, utilities, and other extras
            </a>
          </li>
          <li>
            <a href="#worked-example" className={tocLinkClass}>
              4. Worked example (illustrative)
            </a>
          </li>
        </ul>
      </nav>

      <section id="overview" className="scroll-mt-24 space-y-5">
        <h2 className={sectionTitleClass}>1. How the estimate is built</h2>
        <p className={bodyClass}>
          We start from a <strong>typical rent</strong> for your city and bedroom count using{' '}
          <strong>CMHC</strong>—Canada Mortgage and Housing Corporation—style average rent data, then adjust for
          extras such as parking. The chart can show low and high bands around that reference for context.
        </p>
        <div className="max-w-2xl rounded-lg border border-slate-200 bg-slate-50/80 p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">At a glance</h3>
          <p className={`${bodyClass} mt-2 text-sm md:text-base`}>
            Look up an area average → add dollars for included perks → optional minimum and maximum markers on the
            chart.
          </p>
        </div>
      </section>

      <section id="renters" className="scroll-mt-24 space-y-6">
        <h2 className={sectionTitleClass}>2. Market reference and chart bands</h2>
        <p className={bodyClass}>
          We answer: &quot;What are people paying on average near me?&quot; Using our dataset, we pick an average rent
          and survey year for your province, city, and bedroom count. If the name doesn&apos;t match exactly, we try
          close matches or a sensible fallback.
        </p>

        <div className="space-y-3">
          <h3 id="step-r1-sqft" className="scroll-mt-24 text-lg font-semibold text-slate-900">
            Square footage (optional)
          </h3>
          <p className={bodyClass}>
            CMHC averages describe typical rent for a <strong>bedroom count</strong> in an area, not rent per square
            foot. If you enter size, we compare your square footage to an internal typical size for that bedroom count
            (for example, <strong>{getTypicalSqftForBedrooms(1)} sq ft</strong> for a one-bedroom benchmark). Only{' '}
            <strong>{Math.round(SQFT_RENT_ELASTICITY * 100)}%</strong> of how far you are above or below that typical
            size flows through to rent, so larger units get a <strong>modest</strong> bump and smaller ones a{' '}
            <strong>modest</strong> reduction—not a one-to-one change. The effect is capped so extreme sizes do not
            dominate the number.
          </p>
        </div>

        <p className={bodyClass}>
          Parking, storage, in-suite laundry, and similar items add monthly amounts using the rules in section 3. The
          reference line on the chart is that market-based figure plus those extras when you count them.
        </p>

        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-slate-900">Minimum and maximum on the chart</h3>
          <p className={bodyClass}>
            The &quot;minimum&quot; and &quot;maximum&quot; markers are <strong>not legal rent caps</strong>. They are
            visual guides only: roughly <strong>90%</strong> and <strong>115%</strong> of the reference rent, with
            amenity dollars included or not depending on your settings.
          </p>
        </div>
      </section>

      <section id="amenities" className="scroll-mt-24 space-y-5">
        <h2 className={sectionTitleClass}>3. Parking, utilities, and other extras</h2>
        <p className={bodyClass}>Optional items adjust the benchmark like this:</p>
        <ul className={`${bodyClass} list-disc space-y-3 pl-6`}>
          <li>Each choice starts from a default monthly dollar value in the app.</li>
          <li>
            For electricity, natural gas, and heating oil, that value is scaled by factors meant to reflect typical
            utility costs in your province (with defaults where we do not have a value).
          </li>
          <li>
            Parking, garage, and storage use special rules: the first stall counts at full weight; extra stalls are
            discounted. Shared garages use a reduced factor. Storage can use tiered rates by square footage.
          </li>
          <li>If you type your own dollar amount for an item, that number replaces the calculated one.</li>
        </ul>
      </section>

      <section id="worked-example" className="scroll-mt-24 space-y-6">
        <h2 className={sectionTitleClass}>4. Worked example (illustrative)</h2>
        <p className={bodyClass}>
          The dollar amounts below are <strong>made up</strong>. They show how pieces combine in the renter view—not
          a quote for any real listing.
        </p>
        <div className="max-w-2xl rounded-lg border border-slate-200 bg-slate-50/80 p-5">
          <p className={`${bodyClass} text-sm md:text-base`}>
            <strong>Setup:</strong> You pick a fictive CMA, <strong>Rivertown</strong>, and a <strong>two-bedroom</strong>{' '}
            unit. You enter <strong>1,080 sq ft</strong>, turn on <strong>Internet / Wi-Fi</strong> (cable package), and{' '}
            <strong>parking</strong> (reserved stall, <strong>two</strong> stalls). Typical interior size for a
            two-bedroom benchmark in the app is <strong>{getTypicalSqftForBedrooms(2)} sq ft</strong>.
          </p>
        </div>

        <ol className={`${bodyClass} list-decimal space-y-6 pl-6 marker:font-semibold`}>
          <li className="pl-2">
            <strong className="text-slate-800">Area benchmark.</strong> Suppose the CMHC-style average for a
            two-bedroom in Rivertown is <strong>$1,750</strong> per month. When Statistics Canada asking-rent data
            exists in the app for your city and bedroom count, the starting point can be a{' '}
            <strong>weighted blend</strong> of that CMHC figure and the StatCan value; here we keep the story on the
            $1,750 CMHC anchor.
          </li>
          <li className="pl-2">
            <strong className="text-slate-800">Size adjustment (optional).</strong> If you leave square footage blank,
            this step is skipped. Here: relative size = 1,080 ÷ {getTypicalSqftForBedrooms(2)} = <strong>1.2</strong>.
            Rent change from size = (1.2 − 1) × {SQFT_RENT_ELASTICITY} = <strong>0.07</strong> (a 7% bump, inside the
            ±35% cap). Size-adjusted benchmark = $1,750 × 1.07 = <strong>$1,872.50</strong> (shown rounded as{' '}
            <strong>~$1,873</strong> on the chart).
          </li>
          <li className="pl-2">
            <strong className="text-slate-800">Extras.</strong> Internet uses a single default add-on:{' '}
            <strong>$60</strong>/mo for the cable option. Parking uses the catalog default for a reserved stall (
            <strong>$70</strong>/mo) times a quantity multiplier: first stall at full value, extra stalls at{' '}
            {Math.round(AMENITY_VALUATION_DEFAULTS.additionalQuantityFactor * 100)}% each, so for quantity{' '}
            <strong>2</strong>: 1 + (2 − 1) × {AMENITY_VALUATION_DEFAULTS.additionalQuantityFactor} ={' '}
            <strong>1.85</strong> → parking value = $70 × 1.85 = <strong>$129.50</strong>. Total amenities = $60 + $129.50
            = <strong>$189.50</strong>.
          </li>
          <li className="pl-2">
            <strong className="text-slate-800">Fair reference (main line).</strong> When perks are included in the
            result, the app adds amenities to the size-adjusted benchmark: $1,872.50 + $189.50 ={' '}
            <strong>$2,062</strong>/mo. That is the fair rent reference line for this fictive scenario.
          </li>
          <li className="pl-2">
            <strong className="text-slate-800">Chart guides (not legal limits).</strong> With inclusions on the chart,
            the lower band is <strong>90%</strong> of that full reference: 0.9 × $2,062 ≈ <strong>$1,856</strong>. The
            upper band is <strong>115%</strong> of the size-adjusted benchmark <em>plus</em> the same amenity total:
            (1.15 × $1,872.50) + $189.50 ≈ <strong>$2,343</strong>. If you turn off including perks in the chart, the
            app uses the benchmark without amenity dollars for some of these markers—see section 2.
          </li>
        </ol>
      </section>

      <section className="scroll-mt-24 border-t border-slate-200 pt-8" aria-label="Technical formulas reference">
        <details className="group rounded-lg border border-slate-200 bg-slate-50/50 p-5">
          <summary className="cursor-pointer text-base font-semibold text-slate-900 marker:text-slate-500 group-open:mb-4">
            Formulas (for reference)
          </summary>
          <div className="space-y-6 text-sm text-slate-600">
            <p className="text-slate-600">Labels below match the codebase.</p>
            <div>
              <p className="font-medium text-slate-800">Market reference and square footage</p>
              <code className={codeBlockClass}>
                {`relativeSize = yourSqft ÷ typicalSqft(bedrooms)
rentDelta = clamp((relativeSize − 1) × ${SQFT_RENT_ELASTICITY}, ±35%)
marketBase = blend(cmhcAverage, statcanAskingRentIfAvailable)
marketReference = marketBase × (1 + rentDelta)
renterFairTarget = marketReference + amenityDelta`}
              </code>
            </div>
            <div>
              <p className="font-medium text-slate-800">Chart bands</p>
              <code className={codeBlockClass}>
                {`minimum band: 0.9 × (marketReference + amenityDelta) when inclusions on chart; else 0.9 × marketReference
maximum band: 1.15 × marketReference + amenityDelta when inclusions on chart; else 1.15 × marketReference`}
              </code>
            </div>
            <div>
              <p className="font-medium text-slate-800">Parking quantity (rounded to nearest 0.5)</p>
              <code className={codeBlockClass}>
                q ≤ 1 → q; q &gt; 1 → 1 + (q − 1) × 0.85
              </code>
            </div>
          </div>
        </details>
      </section>
    </article>
  )
}
