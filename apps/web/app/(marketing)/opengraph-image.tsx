import { ImageResponse } from 'next/og';

/* Social share image for msseo.tech (Open Graph / X), in the landing page's palette. */

export const alt = 'MSScore by Morosoft: free SEO audit. See what is costing you customers and what to fix first.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// next/og renders inline styles only, so the design tokens are repeated here.
const NAVY = '#0F1B2D';
const ORANGE = '#F97316';
const TINT = '#FDBA74';
const MIST = '#FAF7F2';
const MIST_3 = '#CBD5E1';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: NAVY, padding: 72 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
          <span style={{ fontSize: 44, fontWeight: 800, color: MIST, letterSpacing: -1 }}>MSScore</span>
          <span style={{ fontSize: 26, color: MIST_3 }}>by Morosoft</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', fontSize: 68, fontWeight: 800, lineHeight: 1.08, color: MIST, letterSpacing: -2 }}>
            Get more customers from Google and AI search,&nbsp;<span style={{ color: TINT }}>without doing SEO yourself</span>
          </div>
          <div style={{ fontSize: 30, color: MIST_3 }}>Free SEO audit · health score · what to fix first</div>
        </div>
        <div style={{ display: 'flex' }}>
          <span style={{ background: ORANGE, color: NAVY, fontSize: 30, fontWeight: 800, padding: '16px 30px', borderRadius: 12 }}>Get my free audit at msseo.tech</span>
        </div>
      </div>
    ),
    size,
  );
}
