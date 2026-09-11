'use client'

// One sidebar for every page. Each page used to define its own copy, which
// is why the nav disagreed with itself — Error KB appeared on some pages and
// not others. Add a link here once and it appears everywhere.

import { usePathname } from 'next/navigation'
import {
  ChevronDown, ArrowRight, MoreHorizontal, CircleHelp, AudioLines,
  LayoutDashboard, ClipboardCheck, Sparkles, MessageSquareText,
  Headphones, Settings2, Users, Bug, ListChecks, Bot as BotIcon, Shield,
  PenSquare, GitCompareArrows, Settings, Brain
} from 'lucide-react'

const WORKSPACE_LINKS = [
  { href: '/',            label: 'Overview',         Icon: LayoutDashboard },
  { href: '/grade',       label: 'Grade',            Icon: ClipboardCheck },
  { href: '/bulk-grade',  label: 'Bulk Grade',       Icon: Sparkles },
  { href: '/llm-verdicts', label: 'AI Verdicts',     Icon: Brain },
  { href: '/prompts',     label: 'Prompt library',   Icon: MessageSquareText },
  { href: '/transcripts', label: 'Transcripts',      Icon: Headphones },
  { href: '/audit-import', label: 'Audit feedback',  Icon: PenSquare },
  { href: '/audit',       label: 'Audit agreement',  Icon: GitCompareArrows },
  { href: '/rules',       label: 'Grading rules',    Icon: Shield },
]

const MANAGE_LINKS = [
  { href: '/bots',   label: 'Bots',     Icon: BotIcon },
  { href: '/setup',  label: 'Model Config', Icon: Settings },
  { href: '#team',   label: 'Team',     Icon: Users },
  { href: '#settings', label: 'Settings', Icon: Settings2 },
]

export default function Sidebar() {
  const pathname = usePathname()

  // '/' would prefix-match everything, so it needs an exact comparison.
  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href)

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark"><AudioLines size={18} /></span>
        <span>MediBuddy<span className="brand-dot"> </span>QC</span>
      </div>

      <div className="workspace-label">Workspace</div>
      <button className="workspace-select">
        <span className="workspace-icon">M</span>
        <span className="workspace-name">Medibuddy QC</span>
        <ChevronDown size={14} />
      </button>

      <nav className="nav-list" aria-label="Primary navigation">
        <div className="nav-section">Workspace</div>
        {WORKSPACE_LINKS.map(({ href, label, Icon }) => (
          <a
            key={href}
            className={`nav-item${isActive(href) ? ' active' : ''}`}
            href={href}
            aria-current={isActive(href) ? 'page' : undefined}
          >
            <Icon size={17} /> {label}
          </a>
        ))}

        <div className="nav-section second">Manage</div>
        {MANAGE_LINKS.map(({ href, label, Icon }) => (
          <a
            key={href}
            className={`nav-item${isActive(href) ? ' active' : ''}`}
            href={href}
            aria-current={isActive(href) ? 'page' : undefined}
          >
            <Icon size={17} /> {label}
          </a>
        ))}
      </nav>

      <div className="sidebar-bottom">
        <div className="help-card">
          <div className="help-icon"><CircleHelp size={16} /></div>
          <div><strong>Need a hand?</strong><p>Read the eval guide</p></div>
          <ArrowRight size={15} />
        </div>
        <div className="profile">
          <div className="avatar">IA</div>
          <div className="profile-text"><strong>Ishitha Arora</strong><span>Admin</span></div>
          <MoreHorizontal size={17} />
        </div>
      </div>
    </aside>
  )
}
