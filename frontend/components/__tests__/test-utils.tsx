// test-utils.tsx – shared testing utilities
import { ReactElement } from 'react';
import { render as rtlRender, RenderOptions } from '@testing-library/react';
import { ThemeProvider } from '@/components/theme-provider'; // adjust if your project uses a theme provider
import { Toaster } from 'sonner'; // toast container used by components

/**
 * Custom render that wraps components with any required context providers.
 * Extend this function if additional providers (e.g., Redux, Router) are needed.
 */
function render(ui: ReactElement, options?: RenderOptions) {
  const Wrapper = ({ children }: { children?: React.ReactNode }) => (
    <ThemeProvider>
      {children}
      <Toaster />
    </ThemeProvider>
  );
  return rtlRender(ui, { wrapper: Wrapper, ...options });
}

export * from '@testing-library/react';
export { render };
