import { Settings as SettingsIcon, X } from 'lucide-react';
import type { ProjectSettings as ProjectSettingsType } from '../types';

type ProjectSettingsProps = {
  isOpen: boolean;
  projectSettings: ProjectSettingsType;
  onProjectSettingsChange: (next: ProjectSettingsType) => void;
  onClose: () => void;
};

export const ProjectSettings = ({
  isOpen,
  projectSettings,
  onProjectSettingsChange,
  onClose,
}: ProjectSettingsProps) => {
  return (
    <div
      id="projectSettingsModal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      style={{ display: isOpen ? 'flex' : 'none' }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        id="projectSettingsPanel"
        className="corner-xl border-border bg-panel w-full max-w-md border shadow-2xl"
      >
        <div className="border-border flex items-center justify-between border-b px-5 py-4">
          <div className="flex items-center gap-2.5">
            <SettingsIcon className="text-text-muted h-5 w-5" />
            <h2 className="text-text text-lg font-medium">Project Settings</h2>
          </div>
          <button
            id="closeProjectSettingsButton"
            className="corner-md text-gray-400 hover:bg-gray-700 hover:text-gray-100 cursor-pointer p-1.5 transition-colors"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col gap-3 p-5">
          <div className="flex items-center gap-2">
            <span className="text-text-subtle text-xs font-medium tracking-wider uppercase">
              Playback
            </span>
          </div>
          <div className="flex flex-col gap-2">
            <label
              htmlFor="playbackSettingsDuration"
              className="text-text-muted text-sm"
            >
              Playback Duration (seconds)
            </label>
            <input
              id="playbackSettingsDuration"
              type="number"
              min="0.5"
              max="30"
              step="0.5"
              value={projectSettings.playbackDuration}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (!Number.isFinite(next) || next < 0.5 || next > 30) return;
                onProjectSettingsChange({
                  ...projectSettings,
                  playbackDuration: next,
                });
              }}
              className="corner-md bg-gray-800 text-gray-100 hover:bg-gray-700 focus:ring-border h-10 w-full px-3 text-sm transition-colors focus:ring-1 focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label
              htmlFor="playbackSettingsFps"
              className="text-text-muted text-sm"
            >
              Frame Rate (fps)
            </label>
            <input
              id="playbackSettingsFps"
              type="number"
              min="10"
              max="120"
              step="5"
              value={projectSettings.playbackFrameRate}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (!Number.isFinite(next) || next < 10 || next > 120) return;
                onProjectSettingsChange({
                  ...projectSettings,
                  playbackFrameRate: next,
                });
              }}
              className="corner-md bg-gray-800 text-gray-100 hover:bg-gray-700 focus:ring-border h-10 w-full px-3 text-sm transition-colors focus:ring-1 focus:outline-none"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
