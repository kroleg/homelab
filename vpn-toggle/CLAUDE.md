# VPN Toggle - Claude Instructions

## Styling

Uses plain CSS (no build step, no external dependencies). Design based on Tailwind/shadcn rose theme:

```css
--primary: #e11d48;      /* rose-600 */
--primary-fg: #fff1f2;   /* rose-50 */
--secondary: #f4f4f5;    /* zinc-100 */
--secondary-fg: #18181b; /* zinc-900 */
--muted: #71717a;        /* zinc-500 */
```

CSS is inline in Pug templates:
- `layout.pug` - base styles, CSS variables, loading spinner
- `index.pug` - page-specific styles
