import { NavLink } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useDatabases } from '../../hooks/useDatabases';
import { useTheme } from '../../hooks/useTheme';
import {
  LayoutDashboard, Swords, FlaskConical, Database,
  Shield, ClipboardList, Users, ChevronDown, ChevronRight, LogOut, Search,
  Sun, Moon, Monitor
} from 'lucide-react';
import { useState } from 'react';

function SidebarLink({ to, icon: Icon, children }: { to: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
          isActive
            ? 'bg-sidebar-hover text-white font-medium'
            : 'text-sidebar-muted hover:text-sidebar-text hover:bg-sidebar-hover/50'
        }`
      }
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      <span className="truncate">{children}</span>
    </NavLink>
  );
}

const themeIcons = { light: Sun, dark: Moon, system: Monitor } as const;
const themeLabels = { light: 'Light', dark: 'Dark', system: 'System' } as const;

export function Sidebar() {
  const { user, logout, isAdmin } = useAuth();
  const { data: databases } = useDatabases();
  const [dbExpanded, setDbExpanded] = useState(false);
  const { theme, cycle } = useTheme();

  return (
    <aside className="flex flex-col w-60 bg-sidebar text-sidebar-text h-screen sticky top-0 overflow-hidden">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-white/10">
        <h1 className="text-lg font-bold tracking-tight">TDN Database Manager</h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
        <SidebarLink to="/" icon={LayoutDashboard}>Dashboard</SidebarLink>
        <SidebarLink to="/loot" icon={Swords}>Loot Editor</SidebarLink>
        <SidebarLink to="/crafting" icon={FlaskConical}>Crafting Editor</SidebarLink>
        <SidebarLink to="/search" icon={Search}>Search</SidebarLink>

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
            <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-sidebar-muted">
              Admin
            </div>
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
