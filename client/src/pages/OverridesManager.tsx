import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useRef, useCallback } from 'react';
import { FolderCog, Upload, Trash2, FileText, RefreshCw } from 'lucide-react';
import {
  listOverrides, uploadOverrides, deleteOverride, subscribeOverrides, type OverrideFile,
} from '../api/overrides';
import { Loading } from '../components/shared/Loading';
import { EmptyState } from '../components/shared/EmptyState';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import { formatBytes } from '../utils';

function formatRelative(mtimeMs: number): string {
  const diff = Date.now() - mtimeMs;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(mtimeMs).toLocaleDateString();
}

interface OverridesManagerProps {
  /** API base path, e.g. "/api/devfiles". */
  apiBase: string;
  /** React Query cache key, unique per folder. */
  queryKey: string;
  title: string;
  description: string;
}

export function OverridesManager({ apiBase, queryKey, title, description }: OverridesManagerProps) {
  const queryClient = useQueryClient();
  const { data: files, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: [queryKey],
    queryFn: () => listOverrides(apiBase),
  });

  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState<File[]>([]);
  const [overwriteNames, setOverwriteNames] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Real-time updates: server pushes the full list whenever the folder changes.
  useEffect(() => {
    const unsubscribe = subscribeOverrides(apiBase, (next) => {
      queryClient.setQueryData([queryKey], next);
    });
    return unsubscribe;
  }, [queryClient, apiBase, queryKey]);

  const uploadMut = useMutation({
    mutationFn: (toUpload: File[]) => uploadOverrides(apiBase, toUpload),
    onSuccess: (next) => {
      queryClient.setQueryData([queryKey], next);
      setPending([]);
      setOverwriteNames([]);
      setUploadError(null);
    },
    onError: (err: Error) => setUploadError(err.message),
  });

  const deleteMut = useMutation({
    mutationFn: (name: string) => deleteOverride(apiBase, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [queryKey] });
      setDeleteTarget(null);
    },
  });

  const existingNames = new Set((files ?? []).map((f) => f.name));

  const startUpload = useCallback((selected: File[]) => {
    if (selected.length === 0) return;
    const clashes = selected.filter((f) => existingNames.has(f.name)).map((f) => f.name);
    setUploadError(null);
    if (clashes.length > 0) {
      setPending(selected);
      setOverwriteNames(clashes);
    } else {
      uploadMut.mutate(selected);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    startUpload(Array.from(e.dataTransfer.files));
  };

  if (isLoading) return <Loading />;

  return (
    <div className="px-6 py-4 space-y-6 overflow-y-auto h-screen">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text flex items-center gap-2">
            <FolderCog className="h-6 w-6 text-primary" /> {title}
          </h1>
          <p className="text-sm text-text-secondary mt-1">{description}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2">
          <p className="text-sm text-danger">{(error as Error).message}</p>
        </div>
      )}

      {/* Upload dropzone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 cursor-pointer transition-colors
          ${dragging ? 'border-primary bg-primary/5' : 'border-border bg-surface hover:bg-surface-hover'}`}
      >
        <Upload className="h-7 w-7 text-text-muted" />
        <p className="text-sm text-text">
          <span className="font-medium text-primary">Click to upload</span> or drag &amp; drop files here
        </p>
        <p className="text-xs text-text-muted">Multiple files supported. Existing names will be overwritten.</p>
        {uploadMut.isPending && <p className="text-xs text-text-secondary">Uploading…</p>}
        {uploadError && <p className="text-xs text-danger">{uploadError}</p>}
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            startUpload(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
      </div>

      {/* File list */}
      <div>
        <h3 className="font-semibold text-sm text-text mb-2">
          Files <Badge>{files?.length ?? 0}</Badge>
        </h3>
        {files && files.length === 0 ? (
          <EmptyState icon={FileText} title="No override files" description="Upload a file to drop it into the override folder" />
        ) : (
          <div className="border border-border rounded-lg bg-surface divide-y divide-border">
            {files?.map((file: OverrideFile) => (
              <div key={file.name} className="flex items-center gap-3 px-4 py-2.5">
                <FileText className="h-4 w-4 text-text-muted flex-shrink-0" />
                <span className="text-sm text-text font-mono truncate">{file.name}</span>
                <span className="text-xs text-text-muted flex-shrink-0">{formatBytes(file.size)}</span>
                <span className="text-xs text-text-muted flex-shrink-0">{formatRelative(file.mtime)}</span>
                <div className="ml-auto flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(file.name)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={overwriteNames.length > 0}
        onClose={() => { setPending([]); setOverwriteNames([]); }}
        onConfirm={() => uploadMut.mutate(pending)}
        title="Overwrite existing files?"
        description={`These files already exist and will be replaced: ${overwriteNames.join(', ')}`}
        confirmLabel="Overwrite"
        variant="primary"
        isLoading={uploadMut.isPending}
        error={uploadError}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMut.mutate(deleteTarget)}
        title="Delete override file"
        description={`Permanently delete "${deleteTarget}" from the override folder?`}
        confirmLabel="Delete"
        isLoading={deleteMut.isPending}
      />
    </div>
  );
}
