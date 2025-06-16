// Fluent 2 design tokens applied as CSS variables
export function applyTheme() {
  const root = document.documentElement;
  root.style.setProperty('--radius-xs', '4px');
  root.style.setProperty('--radius-m', '8px');
  root.style.setProperty('--radius-l', '12px');
  root.style.setProperty('--shadow1', '0 1px 2px rgba(0,0,0,.07)');
  root.style.setProperty('--shadow4', '0 4px 8px rgba(0,0,0,.12)');
  root.style.setProperty('--color-neutral-bg', '#1f1f1f');
  root.style.setProperty('--color-neutral-bg-alt', '#252525');
  root.style.setProperty('--color-card-bg', '#2b2b2b');
  root.style.setProperty('--color-accent-default', '#5569ff');
  root.style.setProperty('--color-text-primary', '#ffffff');
  root.style.setProperty('--color-text-secondary', '#d1d1d1');
  root.style.setProperty('--color-border-subtle', 'rgba(255,255,255,.08)');
  root.style.setProperty('--duration-fast', '120ms');
  root.style.setProperty('--easing', 'cubic-bezier(.4,0,.2,1)');
}
