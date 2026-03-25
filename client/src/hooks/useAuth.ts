import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAuthStatus, logout } from '../api/auth';

export function useAuth() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['auth'],
    queryFn: getAuthStatus,
    retry: false,
    staleTime: 60_000,
  });

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.setQueryData(['auth'], { authenticated: false, user: null });
    },
  });

  return {
    user: data?.user ?? null,
    isAuthenticated: data?.authenticated ?? false,
    isLoading,
    logout: logoutMutation.mutate,
    isAdmin: data?.user?.role === 'admin',
    isEditor: data?.user?.role === 'editor' || data?.user?.role === 'admin',
  };
}
