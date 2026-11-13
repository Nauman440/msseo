import { Check, Cross, IconTile, type IconName } from './icons';
import { ComingSoon, Container, CtaBlock, Panel, Section, SectionHeader } from './primitives';

const OUTCOMES: { icon: IconName; title: string; body: string; soon?: boolean }[] = [
  { icon: 'trend', title: 'More people find you', body: 'We fix what hides your pages, so you appear when customers search for your services.' },
  { icon: 'phone', title: 'More visitors call you', body: 'Better titles, faster pages and stronger trust signals turn searchers into calls and enquiries.' },
  { icon: 'shield', title: 'You stay in control', body: 'Nothing changes without your approval, and one click undoes any change.', soon: true },
  { icon: 'bars', title: 'You see what you paid for', body: 'Daily alerts, weekly summaries and a monthly report in plain language.', soon: true },
];

const ALONE = [
  'Problems stay hidden for months',
  'You pay for SEO tools you have no time to use',
  'You never know what your SEO money did',
  'Competitors keep taking the calls',
];

const WITH = [
  'Problems found in minutes, then checked every week',
  'Fixes prepared for you and applied after one click',
  'Reports that show your clicks, calls and leads',
  'A real team behind you when you want to grow faster',
];

export function Outcomes() {
  return (
    <Section id="outcomes" tone="white">
      <Container className="flex flex-col gap-9">
        <SectionHeader
          eyebrow="Why it works"
          title="What this does for your business"
          intro="You do not need another SEO tool. You need more customers. Here is how we get you there."
        />
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {OUTCOMES.map((o) => (
            <Panel key={o.title}>
              <div className="flex items-start justify-between gap-2">
                <IconTile name={o.icon} />
                {o.soon && <ComingSoon />}
              </div>
              <h3 className="font-display text-xl font-bold leading-[1.3]">{o.title}</h3>
              <p className="text-[15px] leading-[1.6] text-ink-2">{o.body}</p>
            </Panel>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="flex flex-col gap-4 rounded-[20px] border border-border bg-canvas p-6 sm:p-[30px]">
            <h3 className="font-display text-[22px] font-bold">Doing nothing, or doing it alone</h3>
            <ul className="flex flex-col gap-4">
              {ALONE.map((t) => (
                <li key={t} className="flex gap-3 text-base leading-[1.5] text-ink-2">
                  <Cross />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-4 rounded-[20px] border-2 border-primary bg-night p-6 sm:p-[30px]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-[22px] font-bold text-mist">With MSScore</h3>
              <ComingSoon dark />
            </div>
            <ul className="flex flex-col gap-4">
              {WITH.map((t) => (
                <li key={t} className="flex gap-3 text-base leading-[1.5] text-mist-2">
                  <Check tone="tick" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <CtaBlock label="Get my free SEO audit" />
      </Container>
    </Section>
  );
}
