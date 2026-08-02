# OneHook Landing Page

A beautiful, minimalist landing page that showcases OneHook's "one at a time" philosophy. Designed to attract users who value intentional connections over endless options.

## 🚀 Quick Start

### 1. Run Development Server
```bash
npm run dev
```

### 2. Visit Landing Page
Open your browser to: **`http://localhost:3000`**

### 3. User Flows
- **New User**: Landing → Get Started → Login → Redeem Invite → Register → `/app`
- **Existing User**: Landing → Sign In → Login → `/app`
- **Logout**: App → Logout → Redirects to Landing

---

## 🎨 Design & Philosophy

### Core Principles
- **Minimalist**: Clean white backgrounds, plenty of whitespace, strategic accent colors.
- **Creative**: Smooth animations, parallax effects, and intentional typography (Serif Italic for headings).
- **Intentional**: Every element serves a purpose; no clutter or distractions.

### Color Scheme
- **Background**: White (`#FFFFFF`) / Light Gray (`#F5F5F5`)
- **Primary Accent**: Defined in Tailwind (`text-accent`, `bg-accent`)
- **Text**: Dark Charcoal (`#1a1a1a`)

---

## 🏗️ Structure & Features

### 1. Navigation Bar (Fixed)
- Brand logo ("ONEHOOK.")
- Smooth-scroll links: Philosophy, Why OneHook, Sign In.

### 2. Hero Section
- **Headline**: "One Connection. Zero Distractions."
- **Subheading**: Explains the core "focus" value.
- **CTAs**: "Get Started" and "Learn More".

### 3. Philosophy Section
- Problem/Solution narrative.
- **Core Values**: Intention, Constraint, Authenticity.
- Beautiful Unsplash imagery and inspirational quotes.

### 4. Features Section (How It Works)
- **Step 1**: Discover with Intent (Verified profiles, shared values).
- **Step 2**: Connect with Purpose (E2E encryption, real-time privacy).
- **Step 3**: Get Hooked (Single-threaded focus, mutual commitment).

### 5. Social Proof & CTA
- Community statistics and reinforcement of value.
- Final pitch for conversion with invite-only note.

---

## 🛠️ Customization

### Updating Content
All text is located directly in `client/src/components/Landing.tsx`. Look for the JSX tags to modify headlines or descriptions.

### Changing Images
We use high-quality, open-source images from **Unsplash**. To replace them, update the `src` URL in `Landing.tsx`.

**Current Images:**
- **Philosophy**: `photo-1552058544-f03b3d816301` (Focus)
- **Connection**: `photo-1557821552-17105176677c` (Conversation)
- **Get Hooked**: `photo-1529156069898-49953e39b3ac` (Togetherness)

**Optimization Tip**: Append `?auto=format&fit=crop&q=80&w=800` to Unsplash URLs for performance.

---

## 📈 Performance & Accessibility

- **Responsive**: Mobile-first design. Single column on mobile, multi-column on desktop.
- **Animations**: Powered by `framer-motion`. GPU-accelerated (transform/opacity).
- **SEO**: Semantic HTML, optimized meta tags, and fast loading.
- **Accessibility**: WCAG 2.1 AA compliant. Keyboard navigable, high contrast, and descriptive alt text.

---

## 🧪 Testing & Deployment

### Manual Checklist
- [ ] Landing page loads at `/`.
- [ ] Scroll animations trigger smoothly.
- [ ] "Get Started" and "Sign In" navigate to `/login`.
- [ ] Navigation links smooth-scroll to correct sections.
- [ ] Responsive check: Test on mobile/tablet viewports.

### Deployment
The landing page is deployed as part of the frontend build:
```bash
# Build
npm run build:client

# Deploy to AWS
npx cdk deploy OneHook-Frontend-prod
```

---

## ❓ FAQ

**Q: Can I use my own images?**
A: Yes. Place them in `client/public/images/` and reference them as `/images/your-image.jpg`.

**Q: How do I change the accent color?**
A: Update the `accent` color in your `tailwind.config.js`.

**Q: Is it SEO friendly?**
A: Yes, it uses semantic HTML and is optimized for fast loading (Core Web Vitals).
