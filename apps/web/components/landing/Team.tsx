import { CONTACT_HREF } from '@/lib/site';
import { Check, IconTile, type IconName } from './icons';
import { Container, CtaLink, Panel, Section, SectionHeader } from './primitives';

const ROLES: { icon: IconName; title: string; body: string; plan: string }[] = [
  { icon: 'users', title: 'Customer success manager', body: 'One person who knows your business, helps you get set up and answers your questions.', plan: 'All plans' },
  { icon: 'search', title: 'SEO specialists', body: 'Review your strategy and roadmap, and check risky changes before they reach you for approval.', plan: 'Growth and above' },
  { icon: 'pen', title: 'Content editors', body: 'Edit every page and answer so it is accurate and sounds like your business.', plan: 'Growth and above' },
  { icon: 'code', title: 'Developers', body: 'Handle the technical fixes that need hands-on work, such as speed and site structure.', plan: 'Full SEO package' },
  { icon: 'bars', title: 'Strategy and reporting', body: 'Walk you through your results and plan what comes next, in a monthly call.', plan: 'Growth and above' },
];

// The design's "[SUPPORT CHANNELS], [SUPPORT HOURS]" line is left out until the real values exist.
const HELP = ['Guided setup when you join', 'A person reviews your roadmap before you see it', 'Upgrade to a dedicated team any time'];

export function Team() {
  return (
    <Section id="team">
      <Container className="flex flex-col gap-9">
        <SectionHeader
          soon
          eyebrow="Your team"
          title="A full team behind your growth, not just software"
          intro="The tool does the heavy lifting. Real people make sure it is right for your business."
        />
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {ROLES.map((r) => (
            <Panel key={r.title}>
              <IconTile name={r.icon} />
              <h3 className="font-display text-[19px] font-bold leading-[1.3]">{r.title}</h3>
              <p className="text-[15px] leading-[1.6] text-ink-2">{r.body}</p>
              <span className="mt-auto self-start rounded-pill bg-sunken px-2.5 py-0.5 text-xs font-bold text-ink-2">{r.plan}</span>
            </Panel>
          ))}
          <div className="flex flex-col gap-4 rounded-panel bg-night p-[26px] text-mist sm:col-span-2 lg:col-span-3">
            <h3 className="font-display text-[22px] font-bold">Help is always one message away</h3>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {HELP.map((h) => (
                <li key={h} className="flex gap-2.5 text-[15px] text-mist-2">
                  <Check tone="tick" />
                  {h}
                </li>
              ))}
            </ul>
            <CtaLink href={CONTACT_HREF} size="md" className="self-start">
              Talk to our team
            </CtaLink>
          </div>
        </div>
      </Container>
    </Section>
  );
}
