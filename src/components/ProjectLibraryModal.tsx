import { FolderOpen, Plus, Trash2, X } from 'lucide-react';
import type { ProjectSummary } from '../services/projectStorage';

type ProjectLibraryModalProps = {
  isOpen: boolean;
  projects: ProjectSummary[];
  onClose: () => void;
  onLoadProject: (id: string) => void;
  onDeleteProject: (id: string, name: string) => void;
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
  onDeleteProject,
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
            className="corner-md text-gray-400 hover:bg-gray-700 hover:text-gray-100 cursor-pointer p-1.5 transition-colors"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-border flex items-center justify-between border-b px-5 py-3">
          <p className="text-text-subtle text-sm">Saved Projects</p>
          <button
            id="newProjectButton"
            className="corner-md bg-gray-800 text-gray-100 hover:bg-gray-700 inline-flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm transition-colors"
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
                  <div className="corner-lg border-border bg-gray-800/40 hover:bg-gray-700/70 flex items-center gap-1 border p-1 transition-colors">
                    <button
                      className="focus-visible:ring-border flex min-w-0 flex-1 cursor-pointer items-center rounded-md px-3 py-2 text-left transition-colors focus-visible:ring-1 focus:outline-none"
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
                    </button>
                    <button
                      className="text-gray-400 hover:text-danger focus-visible:ring-border inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors focus-visible:ring-1 focus:outline-none"
                      onClick={() => onDeleteProject(project.id, project.name)}
                      aria-label={`${project.name} を削除`}
                      title="Delete Project"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};
