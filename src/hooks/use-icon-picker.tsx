"use client";

import { useMemo, useState } from "react";
import * as LucideIcons from "lucide-react";
import React from "react";
import { WORKSPACE_ICON_NAMES, formatIconForStorage } from "@/lib/workspace-icons";

export { formatIconForStorage };

/** Curated workspace-relevant Lucide icon names (from lib) */
const WORKSPACE_ICON_WHITELIST = WORKSPACE_ICON_NAMES;

/**
 * Extract icon name from stored value for picker comparison.
 * Handles "lucide:Folder", legacy "FolderIcon", or plain "Folder".
 */
export function getIconNameFromStored(
  stored: string | null | undefined
): string | null {
  if (!stored) return null;
  if (stored.includes(":")) {
    const [, name] = stored.split(":");
    return name ?? null;
  }
  // Legacy: Heroicons (FolderIcon) or old Lucide (Folder)
  return HEROICON_TO_LUCIDE[stored] ?? stored;
}

/** Map old Heroicons names to Lucide for backward compatibility */
const HEROICON_TO_LUCIDE: Record<string, keyof typeof LucideIcons> = {
  AcademicCapIcon: "GraduationCap",
  ArchiveBoxIcon: "Archive",
  BanknotesIcon: "Banknote",
  BeakerIcon: "FlaskConical",
  BoltIcon: "Zap",
  BookOpenIcon: "BookOpen",
  BookmarkIcon: "Bookmark",
  BookmarkSquareIcon: "Bookmark",
  BriefcaseIcon: "Briefcase",
  BugAntIcon: "Bug",
  BuildingLibraryIcon: "Library",
  BuildingOffice2Icon: "Building2",
  BuildingOfficeIcon: "Building",
  BuildingStorefrontIcon: "Store",
  CalculatorIcon: "Calculator",
  CalendarIcon: "Calendar",
  CalendarDaysIcon: "CalendarDays",
  CameraIcon: "Camera",
  ChartBarIcon: "BarChart2",
  ChartBarSquareIcon: "BarChart2",
  ChartPieIcon: "PieChart",
  ChatBubbleLeftIcon: "MessageCircle",
  ClipboardDocumentIcon: "ClipboardList",
  ClipboardDocumentCheckIcon: "ClipboardCheck",
  ClockIcon: "Clock",
  CogIcon: "Settings",
  CpuChipIcon: "Cpu",
  CloudIcon: "Cloud",
  CodeBracketIcon: "Code",
  CodeBracketSquareIcon: "Code2",
  CommandLineIcon: "Terminal",
  ComputerDesktopIcon: "Monitor",
  DocumentChartBarIcon: "FileSpreadsheet",
  DocumentDuplicateIcon: "Copy",
  DocumentIcon: "File",
  DocumentTextIcon: "FileText",
  DocumentMagnifyingGlassIcon: "FileSearch",
  EnvelopeIcon: "Mail",
  EyeIcon: "Eye",
  FilmIcon: "Film",
  FingerPrintIcon: "Fingerprint",
  FireIcon: "Flame",
  FlagIcon: "Flag",
  FolderIcon: "Folder",
  FolderOpenIcon: "FolderOpen",
  FolderPlusIcon: "FolderPlus",
  GiftIcon: "Gift",
  GlobeAltIcon: "Globe",
  HeartIcon: "Heart",
  HomeIcon: "Home",
  HomeModernIcon: "Building2",
  InboxIcon: "Inbox",
  InboxStackIcon: "Archive",
  KeyIcon: "Key",
  LanguageIcon: "Languages",
  LifebuoyIcon: "LifeBuoy",
  LightBulbIcon: "Lightbulb",
  LinkIcon: "Link",
  MagnifyingGlassIcon: "Search",
  MapIcon: "Map",
  MapPinIcon: "MapPin",
  MegaphoneIcon: "Megaphone",
  MicrophoneIcon: "Mic",
  MusicalNoteIcon: "Music",
  NewspaperIcon: "Newspaper",
  PaintBrushIcon: "Paintbrush",
  PaperClipIcon: "Paperclip",
  PencilSquareIcon: "SquarePen",
  PhotoIcon: "Image",
  PresentationChartBarIcon: "Presentation",
  PresentationChartLineIcon: "Presentation",
  PrinterIcon: "Printer",
  PuzzlePieceIcon: "Puzzle",
  RocketLaunchIcon: "Rocket",
  RssIcon: "Rss",
  ScaleIcon: "Scale",
  ServerIcon: "Server",
  ServerStackIcon: "Server",
  ShareIcon: "Share2",
  ShieldCheckIcon: "ShieldCheck",
  SparklesIcon: "Sparkles",
  StarIcon: "Star",
  SwatchIcon: "Palette",
  TableCellsIcon: "Table",
  TagIcon: "Tag",
  TicketIcon: "Ticket",
  TrophyIcon: "Trophy",
  UserGroupIcon: "Users",
  UserIcon: "User",
  UsersIcon: "Users",
  VideoCameraIcon: "Video",
  WalletIcon: "Wallet",
  WrenchIcon: "Wrench",
};

export type IconInfo = {
  name: string;
  friendly_name: string;
  Component: React.ComponentType<{ className?: string; [key: string]: unknown }>;
};

export const useIconPicker = (): {
  search: string;
  setSearch: React.Dispatch<React.SetStateAction<string>>;
  icons: IconInfo[];
} => {
  const icons: IconInfo[] = useMemo(
    () =>
      WORKSPACE_ICON_WHITELIST.map((iconName) => {
        const IconComponent = LucideIcons[iconName];
        return {
          name: iconName,
          friendly_name:
            iconName
              .replace(/([A-Z])/g, " $1")
              .trim()
              .replace(/^./, (c) => c.toUpperCase()) ?? iconName,
          Component: IconComponent,
        };
      }),
    []
  );

  const [search, setSearch] = useState("");
  const filteredIcons = useMemo(() => {
    return icons.filter((icon) => {
      if (search === "") return true;
      const searchLower = search.toLowerCase();
      return (
        icon.name.toLowerCase().includes(searchLower) ||
        icon.friendly_name.toLowerCase().includes(searchLower)
      );
    });
  }, [icons, search]);

  return { search, setSearch, icons: filteredIcons };
};

export const IconRenderer = ({
  icon,
  className,
  ...rest
}: {
  icon: string | null | undefined;
} & React.ComponentPropsWithoutRef<"svg">) => {
  const DefaultIcon = LucideIcons.Folder;

  if (!icon) {
    return <DefaultIcon data-slot="icon" className={className} {...rest} />;
  }

  // Parse library:name format (e.g. "lucide:Folder")
  let iconName: string;
  if (icon.includes(":")) {
    const [, name] = icon.split(":");
    iconName = name ?? icon;
  } else {
    // Legacy: Heroicons or plain Lucide name
    iconName = HEROICON_TO_LUCIDE[icon] ?? icon;
  }

  const IconComponent = LucideIcons[iconName as keyof typeof LucideIcons];

  if (!IconComponent) {
    return <DefaultIcon data-slot="icon" className={className} {...rest} />;
  }

  return (
    <IconComponent data-slot="icon" className={className} {...rest} />
  );
};
