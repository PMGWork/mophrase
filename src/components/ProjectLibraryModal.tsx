import { FolderOpen, Plus, X } from 'lucide-react';
import type { ProjectSummary } from '../services/projectStorage';

type ProjectLibraryModalProps = {
  isOpen: boolean;
  projects: ProjectSummary[];
  onClose: () => void;
  onLoadProject: (id: string) => void;
  onCreateNewProject: () => void;
};

const formatUpdatedAt = (timestamp: number): string => {
  if (!Number.isFinite(timestamp)) return '-';
  return new Date(timestamp).toLocaleString();
};

export const ProjectLibraryModal = ({
  isOpen,
  projects,
  onClose,
  onLoadProject,
  onCreateNewProject,
}: ProjectLibraryModalProps) => {
  return (
    <div
      id="projectLibraryModal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      style={{ display: isOpen ? 'flex' : 'none' }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        id="projectLibraryPanel"
        className="corner-xl border-border bg-panel w-full max-w-2xl border shadow-2xl"
      >
        <div className="border-border flex items-center justify-between border-b px-5 py-4">
          <div className="flex items-center gap-2.5">
            <FolderOpen className="text-text-muted h-5 w-5" />
            <h2 className="text-text text-lg font-medium">Load Project</h2>
          </div>
          <button
            id="closeProjectLibraryButton"
            className="corner-md text-text-muted hover:bg-panel-elevated hover:text-text cursor-pointer p-1.5 transition-colors"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-border flex items-center justify-between border-b px-5 py-3">
          <p className="text-text-subtle text-sm">Saved Projects</p>
          <button
            id="newProjectButton"
            className="corner-md bg-panel-elevated text-text hover:bg-border inline-flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm transition-colors"
            onClick={onCreateNewProject}
          >
            <Plus className="h-4 w-4" />
            New Project
          </button>
        </div>

        <div className="max-h-[55vh] overflow-y-auto p-3">
          {projects.length === 0 ? (
            <div className="text-text-subtle px-2 py-8 text-center text-sm">
              保存済みプロジェクトはありません。
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {projects.map((project) => (
                <li key={project.id}>
                  <button
                    className="corner-lg border-border bg-panel-elevated/40 hover:bg-panel-elevated focus:ring-border flex w-full cursor-pointer items-center justify-between border px-4 py-3 text-left transition-colors focus:ring-1 focus:outline-none"
                    onClick={() => onLoadProject(project.id)}
                  >
                    <div className="min-w-0">
                      <p className="text-text truncate text-sm font-medium">
                        {project.name}
                      </p>
                      <p className="text-text-subtle mt-0.5 text-xs">
                        Updated: {formatUpdatedAt(project.updatedAt)}
                      </p>
                    </div>
                    <span className="text-text-subtle shrink-0 text-xs">
                      Open
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};
