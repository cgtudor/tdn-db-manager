import { NavLink } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useDatabases } from '../../hooks/useDatabases';
import { useTheme } from '../../hooks/useTheme';
import {
  LayoutDashboard, Swords, FlaskConical, Leaf, Store, Database,
  Shield, ClipboardList, Users, ChevronDown, ChevronRight, LogOut, Search,
  Sun, Moon, Monitor,
  Activity, MessageSquare, Radio, Map, Globe, FolderCog, ServerCog,
} from 'lucide-react';
import { useState } from 'react';

function SidebarLink({ to, icon: Icon, end, children }: { to: string; icon: React.ElementType; end?: boolean; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
          isActive
            ? 'bg-sidebar-hover text-white font-medium border-l-2 border-amber-500 -ml-[2px]'
            : 'text-sidebar-muted hover:text-sidebar-text hover:bg-sidebar-hover/50'
        }`
      }
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      <span className="truncate">{children}</span>
    </NavLink>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-sidebar-muted flex items-center gap-2">
      <div className="h-px flex-1 bg-white/10" />
      <span>{children}</span>
      <div className="h-px flex-1 bg-white/10" />
    </div>
  );
}

const themeIcons = { light: Sun, dark: Moon, system: Monitor } as const;
const themeLabels = { light: 'Light', dark: 'Dark', system: 'System' } as const;

export function Sidebar() {
  const { user, logout, isAdmin, isDM } = useAuth();
  const { data: databases } = useDatabases();
  const [dbExpanded, setDbExpanded] = useState(false);
  const { theme, cycle } = useTheme();

  return (
    <aside className="flex flex-col w-60 bg-sidebar text-sidebar-text h-screen sticky top-0 overflow-hidden">
      {/* Logo / Branding */}
      <div className="px-4 py-4 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-amber-600/20 flex items-center justify-center flex-shrink-0">
            <svg viewBox="0 0 24 24" className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight" style={{ fontFamily: "'Crimson Pro', Georgia, serif" }}>
              The Dragon's Neck
            </h1>
            <p className="text-[10px] text-sidebar-muted uppercase tracking-widest">Database Manager</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
        <SidebarLink to="/" icon={LayoutDashboard} end>Dashboard</SidebarLink>
        <SidebarLink to="/loot" icon={Swords}>Loot Editor</SidebarLink>
        <SidebarLink to="/crafting" icon={FlaskConical}>Crafting Editor</SidebarLink>
        <SidebarLink to="/ingredients" icon={Leaf}>Ingredients</SidebarLink>
        <SidebarLink to="/stores" icon={Store}>Stores</SidebarLink>
        <SidebarLink to="/search" icon={Search}>Search</SidebarLink>
        <SidebarLink to="/overrides" icon={FolderCog}>Dev Overrides</SidebarLink>

        {/* Live Server (DM/Admin only) */}
        {isDM && (
          <div className="pt-3">
            <SectionHeader>Live Server</SectionHeader>
            <SidebarLink to="/live" icon={Activity} end>Overview</SidebarLink>
            <SidebarLink to="/live/chat" icon={MessageSquare}>Area Chat</SidebarLink>
            <SidebarLink to="/live/feed" icon={Radio}>Activity Feed</SidebarLink>
            <SidebarLink to="/live/heatmap" icon={Map}>Area Analytics</SidebarLink>
            <SidebarLink to="/live/worldmap" icon={Globe}>Worldmap</SidebarLink>
          </div>
        )}

        {/* Database list */}
        <div className="pt-3">
          <button
            onClick={() => setDbExpanded(!dbExpanded)}
            className="flex items-center gap-2 px-3 py-1.5 w-full text-xs font-semibold uppercase tracking-wider text-sidebar-muted hover:text-sidebar-text"
          >
            {dbExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Databases ({databases?.length ?? 0})
          </button>
          {dbExpanded && databases && (
            <div className="ml-1 space-y-0.5">
              {databases.map(db => (
                <SidebarLink key={db.filename} to={`/db/${db.filename}`} icon={Database}>
                  {db.displayName}
                </SidebarLink>
              ))}
            </div>
          )}
        </div>

        {/* Admin section */}
        {isAdmin && (
          <div className="pt-3">
            <SectionHeader>Admin</SectionHeader>
            <SidebarLink to="/live-overrides" icon={ServerCog}>Live Overrides</SidebarLink>
            <SidebarLink to="/backups" icon={Shield}>Backups</SidebarLink>
            <SidebarLink to="/audit" icon={ClipboardList}>Audit Log</SidebarLink>
            <SidebarLink to="/users" icon={Users}>Users</SidebarLink>
          </div>
        )}
      </nav>

      {/* User info */}
      <div className="border-t border-white/10 px-3 py-3">
        <div className="flex items-center gap-2">
          {user?.avatar && (
            <img src={user.avatar} alt="" className="h-7 w-7 rounded-full" />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{user?.username}</div>
            <div className="text-xs text-sidebar-muted capitalize">{user?.role}</div>
          </div>
          {(() => { const Icon = themeIcons[theme]; return (
            <button
              onClick={cycle}
              className="p-1.5 rounded-md text-sidebar-muted hover:text-sidebar-text hover:bg-sidebar-hover transition-colors"
              title={`Theme: ${themeLabels[theme]}`}
            >
              <Icon className="h-4 w-4" />
            </button>
          ); })()}
          <button
            onClick={() => logout()}
            className="p-1.5 rounded-md text-sidebar-muted hover:text-sidebar-text hover:bg-sidebar-hover transition-colors"
            title="Logout"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
