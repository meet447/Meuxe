import type { SVGProps } from "react";

/**
 * Meuxe icon set — single consistent stroke weight (1.6), round caps/joins,
 * 24×24 grid. Every icon in the UI should come from here so line weights
 * stay uniform. Size with `className` (default h-5 w-5).
 */
export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "strokeWidth"> {
  className?: string;
  strokeWidth?: number;
}

function make(d: string | string[], displayName: string) {
  const paths = Array.isArray(d) ? d : [d];
  const Icon = ({ className = "h-5 w-5", strokeWidth = 1.6, ...rest }: IconProps) => (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      {paths.map((p, i) => (
        <path key={i} d={p} />
      ))}
    </svg>
  );
  Icon.displayName = displayName;
  return Icon;
}

/* Navigation & chrome */
export const ChatIcon = make(
  "M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 3.5V17H6.5A2.5 2.5 0 0 1 4 14.5z",
  "ChatIcon",
);
export const HistoryIcon = make(
  ["M3.5 12a8.5 8.5 0 1 0 2.5-6", "M3.5 4v4h4", "M12 8v4l2.5 2.5"],
  "HistoryIcon",
);
export const MiniIcon = make(
  [
    "M4 9V6.5A2.5 2.5 0 0 1 6.5 4H9",
    "M15 4h2.5A2.5 2.5 0 0 1 20 6.5V9",
    "M20 15v2.5a2.5 2.5 0 0 1-2.5 2.5H15",
    "M9 20H6.5A2.5 2.5 0 0 1 4 17.5V15",
    "M9 9h6v6H9z",
  ],
  "MiniIcon",
);
export const ExpandIcon = make(["M15 4h5v5", "M20 4l-6 6", "M9 20H4v-5", "M4 20l6-6"], "ExpandIcon");
export const PeopleIcon = make(
  [
    "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z",
    "M3 20a6 6 0 0 1 12 0",
    "M16 4.3a3.5 3.5 0 0 1 0 6.4",
    "M17.5 14.5a6 6 0 0 1 3.5 5.5",
  ],
  "PeopleIcon",
);
export const UserIcon = make(["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M5 20a7 7 0 0 1 14 0"], "UserIcon");
export const SettingsIcon = make(
  ["M4 7h9", "M17 7h3", "M4 17h3", "M11 17h9", "M13 7a2 2 0 1 0 4 0 2 2 0 0 0-4 0z", "M7 17a2 2 0 1 0 4 0 2 2 0 0 0-4 0z"],
  "SettingsIcon",
);
export const CloseIcon = make(["M6 6l12 12", "M18 6L6 18"], "CloseIcon");
export const BackIcon = make("M14 6l-6 6 6 6", "BackIcon");
export const ChevronRightIcon = make("M10 6l6 6-6 6", "ChevronRightIcon");
export const ChevronDownIcon = make("M6 10l6 6 6-6", "ChevronDownIcon");
export const ChevronUpIcon = make("M6 14l6-6 6 6", "ChevronUpIcon");
export const ArrowRightIcon = make(["M5 12h14", "M13 6l6 6-6 6"], "ArrowRightIcon");
export const SendIcon = make(["M12 19V5", "M6 11l6-6 6 6"], "SendIcon");
export const MicIcon = make(
  [
    "M12 15a3.5 3.5 0 0 0 3.5-3.5v-5A3.5 3.5 0 0 0 8.5 6.5v5A3.5 3.5 0 0 0 12 15z",
    "M5.5 11.5a6.5 6.5 0 0 0 13 0",
    "M12 18v3",
    "M9 21h6",
  ],
  "MicIcon",
);
export const PlusIcon = make(["M12 5v14", "M5 12h14"], "PlusIcon");
export const MinusIcon = make("M5 12h14", "MinusIcon");
export const CheckIcon = make("M5 12.5l4.5 4.5L19 7", "CheckIcon");
export const MoreIcon = make(["M6 12h.01", "M12 12h.01", "M18 12h.01"], "MoreIcon");
export const ExternalIcon = make(
  ["M14 4h6v6", "M20 4l-9 9", "M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"],
  "ExternalIcon",
);
export const CropIcon = make(["M6 2v14a2 2 0 0 0 2 2h14", "M18 22V8a2 2 0 0 0-2-2H2"], "CropIcon");

/* Settings sections */
export const ShieldIcon = make(
  ["M12 3l7.5 3v5.5c0 4.5-3 8.2-7.5 9.5C7.5 19.7 4.5 16 4.5 11.5V6z", "M9 12l2 2 4-4"],
  "ShieldIcon",
);
export const MemoryIcon = make(
  ["M4 8.5h16", "M5 8.5V18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5", "M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v3H4z", "M10 12.5h4"],
  "MemoryIcon",
);
export const FrameIcon = make(
  [
    "M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5z",
    "M12 14a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
    "M7 20a5 5 0 0 1 10 0",
  ],
  "FrameIcon",
);
export const FaceIcon = make(
  ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M9 10h.01", "M15 10h.01", "M8.5 14.5a4.5 4.5 0 0 0 7 0"],
  "FaceIcon",
);
export const SpeakerIcon = make(
  ["M4 10v4a1 1 0 0 0 1 1h2.5l4 3.5V5.5L7.5 9H5a1 1 0 0 0-1 1z", "M15 9.5a3.5 3.5 0 0 1 0 5", "M17.5 7a7 7 0 0 1 0 10"],
  "SpeakerIcon",
);
export const SparkIcon = make(
  ["M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z", "M19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"],
  "SparkIcon",
);
export const KeyboardIcon = make(
  ["M3 8.5A2.5 2.5 0 0 1 5.5 6h13A2.5 2.5 0 0 1 21 8.5v7a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 15.5z", "M7 10h.01", "M11 10h.01", "M15 10h.01", "M17 10h.01", "M8 14h8"],
  "KeyboardIcon",
);
export const LockIcon = make(
  ["M6 11V8.5a6 6 0 0 1 12 0V11", "M5 11h14v7.5a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 5 18.5z"],
  "LockIcon",
);

/* Actions */
export const PlayIcon = make("M8 6v12l10-6z", "PlayIcon");
export const SearchIcon = make(["M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z", "M20 20l-3.5-3.5"], "SearchIcon");
export const TrashIcon = make(
  ["M5 7h14", "M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7", "M7 7l.8 11.2A2 2 0 0 0 9.8 20h4.4a2 2 0 0 0 2-1.8L17 7", "M10 11v5", "M14 11v5"],
  "TrashIcon",
);
export const PinIcon = make(["M12 17v4", "M8 17h8l-1-6 2-2V8a5 5 0 0 0-10 0v1l2 2z"], "PinIcon");
export const RefreshIcon = make(["M20 12a8 8 0 1 1-2.3-5.7", "M20 4v4.5h-4.5"], "RefreshIcon");
export const DownloadIcon = make(["M12 4v11", "M7 10l5 5 5-5", "M5 20h14"], "DownloadIcon");
export const UploadIcon = make(["M12 15V4", "M7 9l5-5 5 5", "M5 20h14"], "UploadIcon");
export const WandIcon = make(
  ["M15 4l5 5L7.5 21.5 2.5 16.5z", "M14 5l5 5", "M5 3v2", "M4 4h2", "M19 15v2", "M18 16h2"],
  "WandIcon",
);
export const EditIcon = make(["M4 20h4l11-11-4-4L4 16z", "M13 7l4 4"], "EditIcon");
export const InfoIcon = make(["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M12 11v5", "M12 8h.01"], "InfoIcon");
export const WarningIcon = make(["M12 4l9 16H3z", "M12 10v4", "M12 17h.01"], "WarningIcon");

/* Files, tools, world */
export const FolderIcon = make(
  "M3.5 7A1.5 1.5 0 0 1 5 5.5h4l2 2h8A1.5 1.5 0 0 1 20.5 9v8A1.5 1.5 0 0 1 19 18.5H5A1.5 1.5 0 0 1 3.5 17z",
  "FolderIcon",
);
export const FileIcon = make(
  ["M6 4.5A1.5 1.5 0 0 1 7.5 3H14l5 5v11.5a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 6 19.5z", "M14 3v5h5", "M9 13h6", "M9 17h6"],
  "FileIcon",
);
export const NoteIcon = make(
  ["M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5v15A1.5 1.5 0 0 1 16.5 21h-9A1.5 1.5 0 0 1 6 19.5z", "M9 8h6", "M9 12h6", "M9 16h3"],
  "NoteIcon",
);
export const TerminalIcon = make(
  ["M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5z", "M8 9l3 3-3 3", "M13 15h4"],
  "TerminalIcon",
);
export const GlobeIcon = make(
  ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M3 12h18", "M12 3a13 13 0 0 1 0 18", "M12 3a13 13 0 0 0 0 18"],
  "GlobeIcon",
);
export const CpuIcon = make(
  ["M7 7h10v10H7z", "M4 10h3", "M4 14h3", "M17 10h3", "M17 14h3", "M10 4v3", "M14 4v3", "M10 17v3", "M14 17v3"],
  "CpuIcon",
);
export const AppWindowIcon = make(
  ["M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5z", "M4 9h16", "M7.5 6.5h.01", "M10 6.5h.01"],
  "AppWindowIcon",
);

/* Personality glyphs */
export const BookIcon = make(
  [
    "M4 5.5A1.5 1.5 0 0 1 5.5 4H10a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H5.5A1.5 1.5 0 0 1 4 16.5z",
    "M20 5.5A1.5 1.5 0 0 0 18.5 4H14a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h4.5a1.5 1.5 0 0 0 1.5-1.5z",
  ],
  "BookIcon",
);
export const SunIcon = make(
  ["M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z", "M12 2.5v2", "M12 19.5v2", "M2.5 12h2", "M19.5 12h2", "M5.3 5.3l1.4 1.4", "M17.3 17.3l1.4 1.4", "M5.3 18.7l1.4-1.4", "M17.3 6.7l1.4-1.4"],
  "SunIcon",
);
export const ZapIcon = make("M13 3L5 13.5h6L10 21l8-10.5h-6z", "ZapIcon");
export const WavesIcon = make(
  [
    "M3 8c2 0 2.5-1.5 4.5-1.5S9.5 8 12 8s2.5-1.5 4.5-1.5S19 8 21 8",
    "M3 13c2 0 2.5-1.5 4.5-1.5S9.5 13 12 13s2.5-1.5 4.5-1.5S19 13 21 13",
    "M3 18c2 0 2.5-1.5 4.5-1.5S9.5 18 12 18s2.5-1.5 4.5-1.5S19 18 21 18",
  ],
  "WavesIcon",
);
export const HeartIcon = make("M12 20s-7-4.4-7-9.5A4 4 0 0 1 12 8a4 4 0 0 1 7 2.5C19 15.6 12 20 12 20z", "HeartIcon");
export const MoonIcon = make("M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z", "MoonIcon");
