@AGENTS.md

# ReceiptLens Design System

## Visual Identity
- Theme: Playful detective / spy noir meets modern fintech
- Background: Deep navy gradient (#0a0e1a to #131832)
- Accent: Purple-500 (#a855f7) for interactive elements
- Cards: Glassmorphism (backdrop-blur-xl, semi-transparent, subtle borders)
- Typography: Clean sans-serif, big numbers, uppercase labels
- Mascot: Purple cartoon spy detective, used across all screens
- Personality: Fun, mischievous, not serious. Detective puns encouraged.

## UI Rules
- No scrolling on home dashboard — everything fits in viewport
- Mobile-first (390x844 iPhone 14)
- All animations use framer-motion
- Components use shadcn/ui
- Cards have rounded-2xl corners with purple gradient borders

## Dashboard Layout
- Top (flex-shrink-0): greeting row, SCAN NOW button, 2×2 stats grid
- Bottom (flex-1): horizontally swipeable carousel with dot page indicators
- Carousel slides: Store Rankings · Recent Cases · Smart Insight
- Each slide is full carousel width; user swipes left/right to navigate
- Dot indicators below carousel follow iPhone app-switcher style (active dot widens)
