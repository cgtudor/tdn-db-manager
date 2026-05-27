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
import { IngredientExplorer } from './pages/IngredientExplorer';
import { StoreExplorer } from './pages/StoreExplorer';
import { SearchResults } from './pages/SearchResults';
import { BackupManager } from './pages/BackupManager';
import { AuditLog } from './pages/AuditLog';
import { UserManager } from './pages/UserManager';
import { LiveDashboard } from './pages/LiveDashboard';
import { LiveChat } from './pages/LiveChat';
import { LiveFeed } from './pages/LiveFeed';

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
              <Route path="ingredients" element={<IngredientExplorer />} />
              <Route path="stores" element={<StoreExplorer />} />
              <Route path="live" element={<LiveDashboard />} />
              <Route path="live/chat" element={<LiveChat />} />
              <Route path="live/feed" element={<LiveFeed />} />
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
