import { createRootRoute, HeadContent, Outlet, Scripts } from '@tanstack/react-router';
import '@/index.css';
import '@generated/theme-tokens.css';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1.0' },
      { title: 'Skylark Drones Business Intelligence' },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <link rel="icon" type="image/png" href="/favicon.png" />
      </head>
      <body className="bg-[hsl(var(--color-slate-canvas))] text-[hsl(var(--color-frost))] min-h-screen">
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}
