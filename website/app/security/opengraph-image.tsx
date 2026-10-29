// website/app/security/opengraph-image.tsx
import { ImageResponse } from 'next/og';

export const alt = 'Verify Wireup yourself. Published with SLSA provenance.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          background: 'linear-gradient(135deg, #0a0a0a 0%, #1f1f1f 100%)',
          color: '#fafafa',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 28, color: '#a3a3a3' }}>
          <div style={{ width: 20, height: 20, borderRadius: 6, background: '#fafafa' }} />
          Wireup / security
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ fontSize: 68, fontWeight: 600, lineHeight: 1.05, letterSpacing: -2 }}>
            Verify Wireup yourself.
          </div>
          <div style={{ fontSize: 68, fontWeight: 600, lineHeight: 1.05, letterSpacing: -2, color: '#a3a3a3' }}>
            Don&apos;t take our word for it.
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '14px 22px',
              borderRadius: 999,
              border: '2px solid #34d399',
              color: '#d1fae5',
              fontSize: 28,
            }}
          >
            <div style={{ width: 16, height: 16, borderRadius: 999, background: '#34d399' }} />
            Published with SLSA provenance
          </div>
          <div style={{ fontSize: 26, color: '#a3a3a3' }}>
            npm Trusted Publishing · hash-published · zero runtime dependencies
          </div>
        </div>
      </div>
    ),
    size,
  );
}
