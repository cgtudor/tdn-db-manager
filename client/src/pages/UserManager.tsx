import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getUsers, setUserRole } from '../api/admin';
import { Loading } from '../components/shared/Loading';
import { Badge } from '../components/ui/Badge';
import { useAuth } from '../hooks/useAuth';
import type { UserRole } from '../types';
import { formatDistanceToNow } from 'date-fns';

const ROLE_BADGES: Record<UserRole, 'success' | 'warning' | 'default'> = {
  admin: 'success',
  editor: 'warning',
  viewer: 'default',
};

export function UserManager() {
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();
  const { data: users, isLoading } = useQuery({ queryKey: ['users'], queryFn: getUsers });

  const roleMutation = useMutation({
    mutationFn: (p: { discordId: string; role: string }) => setUserRole(p.discordId, p.role),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });

  if (isLoading) return <Loading />;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-text">User Management</h1>
      <p className="text-sm text-text-secondary">Users appear here after they log in with Discord.</p>

      <div className="border border-border rounded-lg bg-surface overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-dim border-b border-border">
              <th className="text-left px-4 py-2.5 font-medium text-text-secondary">User</th>
              <th className="text-left px-4 py-2.5 font-medium text-text-secondary">Discord ID</th>
              <th className="text-left px-4 py-2.5 font-medium text-text-secondary">Role</th>
              <th className="text-left px-4 py-2.5 font-medium text-text-secondary">Last Login</th>
              <th className="text-left px-4 py-2.5 font-medium text-text-secondary">Joined</th>
            </tr>
          </thead>
          <tbody>
            {users?.map(u => (
              <tr key={u.discord_id} className="border-b border-border last:border-0">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    {u.avatar_url && <img src={u.avatar_url} alt="" className="h-6 w-6 rounded-full" />}
                    <span className="font-medium">{u.username}</span>
                    {u.discord_id === currentUser?.id && <Badge variant="info">you</Badge>}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-text-muted font-mono text-xs">{u.discord_id}</td>
                <td className="px-4 py-2.5">
                  {u.discord_id === currentUser?.id ? (
                    <Badge variant={ROLE_BADGES[u.role]}>{u.role}</Badge>
                  ) : (
                    <select
                      value={u.role}
                      onChange={e => roleMutation.mutate({ discordId: u.discord_id, role: e.target.value })}
                      className="px-2 py-1 text-sm border border-border rounded bg-surface"
                      disabled={roleMutation.isPending}
                    >
                      <option value="admin">admin</option>
                      <option value="editor">editor</option>
                      <option value="viewer">viewer</option>
                    </select>
                  )}
                </td>
                <td className="px-4 py-2.5 text-text-muted text-xs">
                  {u.last_login_at ? formatDistanceToNow(new Date(u.last_login_at + 'Z'), { addSuffix: true }) : 'never'}
                </td>
                <td className="px-4 py-2.5 text-text-muted text-xs">
                  {formatDistanceToNow(new Date(u.created_at + 'Z'), { addSuffix: true })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
