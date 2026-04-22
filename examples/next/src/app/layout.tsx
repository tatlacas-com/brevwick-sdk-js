import type { Metadata, Viewport } from 'next';
import type { ReactElement, ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Brevwick — Next.js example',
  description: 'Minimal Next.js app wired up with @tatlacas/brevwick-react.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        }}
      >
        {children}
      </body>
    </html>
  );
}
