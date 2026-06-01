import { useMemo, useState, useCallback, useEffect } from 'react';
import {
  DataGrid as MuiDataGrid,
  GridColDef,
  GridPaginationModel,
  GridSortModel,
  GridFilterModel,
  GridActionsCellItem,
} from '@mui/x-data-grid';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { Trash2 } from 'lucide-react';
import type { ColumnInfo } from '../../types';

interface DataGridProps {
  columns: ColumnInfo[];
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  limit: number;
  loading?: boolean;
  canEdit?: boolean;
  filterModel?: GridFilterModel;
  onSort: (column: string) => void;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
  onFilterModelChange?: (model: GridFilterModel) => void;
  onUpdate?: (rowid: number, changes: Record<string, unknown>) => Promise<void>;
  onDelete?: (rowid: number) => Promise<void>;
}

function useIsDark() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

// Build a MUI theme that matches our Tailwind design tokens
function buildTheme(dark: boolean) {
  return createTheme({
    palette: {
      mode: dark ? 'dark' : 'light',
      primary: {
        main: dark ? '#d97706' : '#b45309',
      },
      background: {
        default: dark ? '#12100e' : '#faf7f2',
        paper: dark ? '#1a1614' : '#fffdf9',
      },
      text: {
        primary: dark ? '#f5efe8' : '#1c1410',
        secondary: dark ? '#c4b8a8' : '#5c4f42',
      },
      divider: dark ? '#33291f' : '#e8e0d4',
      error: {
        main: dark ? '#f87171' : '#dc2626',
      },
    },
    typography: {
      fontFamily: "'Source Sans 3', system-ui, sans-serif",
      fontSize: 13,
    },
    shape: {
      borderRadius: 8,
    },
  });
}

export function DataGrid({
  columns, rows, total, page, limit, loading, canEdit, filterModel,
  onSort, onPageChange, onLimitChange, onFilterModelChange, onUpdate, onDelete,
}: DataGridProps) {
  const isDark = useIsDark();
  const muiTheme = useMemo(() => buildTheme(isDark), [isDark]);

  const gridColumns: GridColDef[] = useMemo(() => {
    const cols: GridColDef[] = columns
      .filter(c => c.name !== '_rowid')
      .map(col => ({
        field: col.name,
        headerName: col.name,
        flex: 1,
        minWidth: 100,
        editable: canEdit ?? false,
        filterable: true,
        type: col.type.toUpperCase().includes('INT') || col.type.toUpperCase().includes('REAL')
          ? 'number' : 'string',
      }));

    if (canEdit) {
      cols.push({
        field: '_actions',
        type: 'actions',
        headerName: '',
        width: 70,
        getActions: (params) => [
          <GridActionsCellItem
            key="delete"
            icon={<Trash2 className="h-4 w-4" />}
            label="Delete"
            onClick={() => onDelete?.(params.row._rowid as number)}
          />,
        ],
      });
    }

    return cols;
  }, [columns, canEdit, onDelete]);

  const gridRows = useMemo(() =>
    rows.map(row => ({
      ...row,
      id: row._rowid as number,
    })),
    [rows]
  );

  const handlePaginationChange = useCallback((model: GridPaginationModel) => {
    onPageChange(model.page + 1);
    if (model.pageSize !== limit) {
      onLimitChange(model.pageSize);
    }
  }, [onPageChange, onLimitChange, limit]);

  const handleSortChange = useCallback((model: GridSortModel) => {
    if (model.length > 0) {
      onSort(model[0].field);
    } else {
      onSort('');
    }
  }, [onSort]);

  const processRowUpdate = useCallback(async (newRow: Record<string, unknown>, oldRow: Record<string, unknown>) => {
    const rowid = newRow._rowid as number;
    const changes: Record<string, unknown> = {};
    for (const key of Object.keys(newRow)) {
      if (key === '_rowid' || key === 'id') continue;
      if (newRow[key] !== oldRow[key]) {
        changes[key] = newRow[key];
      }
    }
    if (Object.keys(changes).length > 0 && onUpdate) {
      await onUpdate(rowid, changes);
    }
    return newRow;
  }, [onUpdate]);

  const borderColor = isDark ? '#33291f' : '#e8e0d4';
  const headerBg = isDark ? '#12100e' : '#faf7f2';
  const hoverBg = isDark ? '#2a2420' : '#f5f0e8';
  const textSecondary = isDark ? '#c4b8a8' : '#5c4f42';

  return (
    <ThemeProvider theme={muiTheme}>
      <div className="w-full h-full">
        <MuiDataGrid
          rows={gridRows}
          columns={gridColumns}
          rowCount={total}
          paginationMode="server"
          sortingMode="server"
          filterMode="server"
          paginationModel={{ page: page - 1, pageSize: limit }}
          onPaginationModelChange={handlePaginationChange}
          onSortModelChange={handleSortChange}
          filterModel={filterModel}
          onFilterModelChange={onFilterModelChange}
          loading={loading}
          pageSizeOptions={[25, 50, 100, 200]}
          processRowUpdate={canEdit ? processRowUpdate : undefined}
          disableRowSelectionOnClick
          density="compact"
          autoHeight={false}
          showToolbar
          slotProps={{
            toolbar: {
              showQuickFilter: true,
              quickFilterProps: {
                debounceMs: 600,
              },
            },
          }}
          sx={{
            height: '100%',
            border: 'none',
            fontFamily: 'inherit',
            fontSize: '0.8125rem',
            // Header
            '& .MuiDataGrid-columnHeaders': {
              backgroundColor: headerBg,
              borderBottom: `1px solid ${borderColor}`,
            },
            '& .MuiDataGrid-columnHeader': {
              fontWeight: 600,
              fontSize: '0.75rem',
              color: textSecondary,
              letterSpacing: '0.01em',
              '&:focus, &:focus-within': {
                outline: 'none',
              },
            },
            '& .MuiDataGrid-columnSeparator': {
              color: borderColor,
            },
            // Cells
            '& .MuiDataGrid-cell': {
              borderBottom: `1px solid ${borderColor}`,
              '&:focus, &:focus-within': {
                outline: 'none',
              },
            },
            '& .MuiDataGrid-row': {
              '&:hover': {
                backgroundColor: hoverBg,
              },
              '&.Mui-selected': {
                backgroundColor: isDark ? 'rgba(217,119,6,0.08)' : 'rgba(180,83,9,0.04)',
                '&:hover': {
                  backgroundColor: isDark ? 'rgba(217,119,6,0.12)' : 'rgba(180,83,9,0.08)',
                },
              },
            },
            // Footer / pagination
            '& .MuiDataGrid-footerContainer': {
              borderTop: `1px solid ${borderColor}`,
              minHeight: 44,
            },
            '& .MuiTablePagination-root': {
              fontSize: '0.75rem',
              color: textSecondary,
            },
            '& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows': {
              fontSize: '0.75rem',
              color: textSecondary,
            },
            '& .MuiTablePagination-select': {
              fontSize: '0.75rem',
            },
            // Toolbar
            '& .MuiDataGrid-toolbarContainer': {
              padding: '4px 8px',
              gap: '4px',
              borderBottom: `1px solid ${borderColor}`,
              '& .MuiButtonBase-root': {
                fontSize: '0.75rem',
                color: textSecondary,
                textTransform: 'none',
                fontFamily: "'Source Sans 3', system-ui, sans-serif",
                '&:hover': {
                  backgroundColor: hoverBg,
                  color: isDark ? '#f5efe8' : '#1c1410',
                },
              },
            },
            // Column menu & filter panel
            '& .MuiDataGrid-menuIcon': {
              color: textSecondary,
            },
            '& .MuiDataGrid-iconButtonContainer': {
              '& .MuiIconButton-root': {
                color: textSecondary,
                '&:hover': {
                  backgroundColor: hoverBg,
                },
              },
            },
            // Row striping
            '& .MuiDataGrid-row:nth-of-type(odd)': {
              backgroundColor: isDark ? 'rgba(42,36,32,0.4)' : 'rgba(245,240,232,0.4)',
            },
            // Scrollbar
            '& .MuiDataGrid-scrollbar': {
              '&::-webkit-scrollbar': {
                width: 6,
                height: 6,
              },
              '&::-webkit-scrollbar-thumb': {
                borderRadius: 3,
                backgroundColor: isDark ? '#4d3f32' : '#d4c9b8',
              },
            },
            // No rows overlay
            '& .MuiDataGrid-overlay': {
              backgroundColor: 'transparent',
              fontSize: '0.8125rem',
              color: textSecondary,
            },
          }}
        />
      </div>
    </ThemeProvider>
  );
}
