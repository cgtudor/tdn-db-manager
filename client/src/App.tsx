import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from './components/layout/Layout';
import { ProtectedRoute, AdminRoute } from './components/layout/ProtectedRoute';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { DatabaseExplorer } from './pages/DatabaseExplorer';
import { TableView } from './pages/TableView';
import { LootEditor } from './pages/LootEditor';
import { CraftingEditor } from './pages/CraftingEditor';
import { SearchResults } from './pages/SearchResults';
import { BackupManager } from './pages/BackupManager';
import { AuditLog } from './pages/AuditLog';
import { UserManager } from './pages/UserManager';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="db/:dbName" element={<DatabaseExplorer />} />
              <Route path="db/:dbName/:tableName" element={<TableView />} />
              <Route path="loot" element={<LootEditor />} />
              <Route path="crafting" element={<CraftingEditor />} />
              <Route path="search" element={<SearchResults />} />

              {/* Admin routes */}
              <Route element={<AdminRoute />}>
                <Route path="backups" element={<BackupManager />} />
                <Route path="audit" element={<AuditLog />} />
                <Route path="users" element={<UserManager />} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
