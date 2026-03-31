import Link from 'next/link';
import Navbar from '@/components/Navbar';
import {
  Zap,
  GitBranch,
  Shield,
  Users,
  Code2,
  Sparkles,
  ArrowRight,
  Terminal,
  GitPullRequest,
  Brain,
} from 'lucide-react';

const features = [
  {
    icon: Code2,
    title: 'In-Browser Editor',
    description:
      'Full VS Code experience powered by Monaco Editor. Syntax highlighting, IntelliSense, and multi-tab editing.',
    color: 'text-primary',
    bg: 'bg-primary/10',
    border: 'border-primary/20',
  },
  {
    icon: GitBranch,
    title: 'Version Control',
    description:
      'Track every change with visual commit history, diffs, and branching — all without the command line.',
    color: 'text-accent',
    bg: 'bg-accent/10',
    border: 'border-accent/20',
  },
  {
    icon: Users,
    title: 'Real-Time Collaboration',
    description:
      'Edit code with your team simultaneously. See cursors, selections, and changes in real time.',
    color: 'text-success',
    bg: 'bg-success/10',
    border: 'border-success/20',
  },
  {
    icon: Brain,
    title: 'AI-Powered',
    description:
      'Get AI code explanations, automatic bug detection, and README generation powered by Gemini.',
    color: 'text-warning',
    bg: 'bg-warning/10',
    border: 'border-warning/20',
  },
  {
    icon: GitPullRequest,
    title: 'Issues & Pull Requests',
    description:
      'Track bugs, plan features, and review code changes with a streamlined PR workflow.',
    color: 'text-pink-400',
    bg: 'bg-pink-400/10',
    border: 'border-pink-400/20',
  },
  {
    icon: Shield,
    title: 'Secure by Default',
    description:
      'Enterprise-grade authentication, private repositories, and row-level security built in.',
    color: 'text-cyan-400',
    bg: 'bg-cyan-400/10',
    border: 'border-cyan-400/20',
  },
];

const stats = [
  { value: '∞', label: 'Repositories' },
  { value: '< 50ms', label: 'Editor Latency' },
  { value: '100%', label: 'Free Forever' },
  { value: 'AI', label: 'Powered' },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      {/* Hero Section */}
      <section className="relative flex flex-1 flex-col items-center justify-center px-4 pt-20 pb-32 overflow-hidden">
        {/* Background Effects */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-0 -translate-x-1/2 h-[500px] w-[800px] rounded-full bg-primary/5 blur-[120px]" />
          <div className="absolute right-0 top-1/3 h-[300px] w-[400px] rounded-full bg-accent/5 blur-[100px]" />
          <div className="absolute left-0 bottom-1/4 h-[200px] w-[300px] rounded-full bg-pink-500/5 blur-[80px]" />
        </div>

        <div className="relative z-10 flex max-w-4xl flex-col items-center text-center">
          {/* Badge */}
          <div className="animate-fade-in mb-8 flex items-center gap-2 rounded-full bg-surface border border-border px-4 py-1.5 text-sm text-muted">
            <Sparkles className="h-4 w-4 text-primary" />
            <span>Now with AI-powered code assistance</span>
          </div>

          {/* Heading */}
          <h1
            className="animate-slide-up text-5xl font-extrabold tracking-tight text-foreground sm:text-6xl lg:text-7xl [animation-delay:0.1s]"
          >
            Where Code Comes
            <br />
            <span className="gradient-text">To Life</span>
          </h1>

          {/* Subtitle */}
          <p
            className="animate-slide-up mt-6 max-w-2xl text-lg leading-relaxed text-muted sm:text-xl [animation-delay:0.2s] [animation-fill-mode:backwards]"
          >
            DevForge is the next-generation platform for developers to host, review,
            and collaborate on code — with an AI copilot built right in.
          </p>

          {/* CTA Buttons */}
          <div
            className="animate-slide-up mt-10 flex flex-col gap-4 sm:flex-row [animation-delay:0.3s] [animation-fill-mode:backwards]"
          >
            <Link
              href="/register"
              className="group flex items-center justify-center gap-2 rounded-xl bg-primary px-8 py-3.5 text-base font-semibold text-white shadow-xl shadow-primary/25 hover:bg-primary-hover hover:shadow-primary/40 transition-all duration-300 animate-pulse-glow"
              id="hero-cta-primary"
            >
              Start Building — Free
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              href="#features"
              className="flex items-center justify-center gap-2 rounded-xl border border-border bg-surface px-8 py-3.5 text-base font-semibold text-foreground hover:bg-surface-hover hover:border-border-bright transition-all duration-300"
              id="hero-cta-secondary"
            >
              <Terminal className="h-4 w-4 text-muted" />
              See Features
            </Link>
          </div>

          {/* Stats Bar */}
          <div
            className="animate-slide-up mt-16 grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-8 [animation-delay:0.4s] [animation-fill-mode:backwards]"
          >
            {stats.map((stat) => (
              <div key={stat.label} className="flex flex-col items-center">
                <span className="text-2xl font-bold gradient-text">
                  {stat.value}
                </span>
                <span className="mt-1 text-xs text-muted uppercase tracking-wider">
                  {stat.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Terminal Preview */}
        <div
          className="animate-slide-up relative z-10 mt-20 w-full max-w-3xl [animation-delay:0.5s] [animation-fill-mode:backwards]"
        >
          <div className="glass rounded-2xl border border-border shadow-2xl shadow-black/30 overflow-hidden">
            {/* Title bar */}
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <div className="h-3 w-3 rounded-full bg-danger/60" />
              <div className="h-3 w-3 rounded-full bg-warning/60" />
              <div className="h-3 w-3 rounded-full bg-success/60" />
              <span className="ml-3 text-xs text-muted font-mono">
                devforge — main
              </span>
            </div>
            {/* Code content */}
            <div className="p-6 font-mono text-sm leading-relaxed">
              <p>
                <span className="text-muted">$</span>{' '}
                <span className="text-accent">devforge</span>{' '}
                <span className="text-foreground">init my-awesome-project</span>
              </p>
              <p className="mt-2 text-success">
                ✓ Repository created successfully
              </p>
              <p className="text-success">✓ README.md generated by AI</p>
              <p className="text-success">✓ .gitignore configured</p>
              <p className="mt-2">
                <span className="text-muted">$</span>{' '}
                <span className="text-accent">devforge</span>{' '}
                <span className="text-foreground">push --message &quot;Initial commit&quot;</span>
              </p>
              <p className="mt-2 text-primary">
                → Pushing to https://devforge.dev/you/my-awesome-project
              </p>
              <p className="text-success mt-1">
                ✓ Commit abc1234 pushed to main
              </p>
              <p className="mt-3 text-muted">
                <span className="animate-pulse">▊</span>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="relative px-4 py-32">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-foreground sm:text-4xl">
              Everything you need to{' '}
              <span className="gradient-text">ship faster</span>
            </h2>
            <p className="mt-4 text-lg text-muted max-w-2xl mx-auto">
              From writing your first line of code to deploying in production,
              DevForge has you covered.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, i) => (
              <div
                key={feature.title}
                className="group rounded-2xl bg-surface border border-border p-6 hover:border-border-bright hover:bg-surface-hover transition-all duration-300 cursor-default [animation-delay:var(--delay)] [animation-fill-mode:backwards]"
                style={{
                  '--delay': `${i * 0.1}s`,
                } as React.CSSProperties}
              >
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-xl ${feature.bg} border ${feature.border} mb-4 group-hover:scale-110 transition-transform duration-300`}
                >
                  <feature.icon className={`h-6 w-6 ${feature.color}`} />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm leading-relaxed text-muted">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative px-4 py-24">
        <div className="mx-auto max-w-3xl text-center">
          <div className="rounded-2xl glass border border-border p-12 relative overflow-hidden">
            <div className="absolute inset-0 bg-linear-to-br from-primary/5 via-transparent to-accent/5" />
            <div className="relative z-10">
              <Zap className="mx-auto h-10 w-10 text-primary mb-4" />
              <h2 className="text-3xl font-bold text-foreground sm:text-4xl">
                Ready to forge your next project?
              </h2>
              <p className="mt-4 text-lg text-muted">
                Join developers building the future. No credit card required.
              </p>
              <Link
                href="/register"
                className="mt-8 inline-flex items-center gap-2 rounded-xl bg-primary px-8 py-3.5 text-base font-semibold text-white shadow-xl shadow-primary/25 hover:bg-primary-hover transition-all duration-300"
                id="cta-bottom"
              >
                Create Free Account
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border px-4 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            <span className="text-sm font-semibold text-foreground">
              DevForge
            </span>
          </div>
          <p className="text-xs text-muted">
            © {new Date().getFullYear()} DevForge. Built with passion.
          </p>
        </div>
      </footer>
    </div>
  );
}
