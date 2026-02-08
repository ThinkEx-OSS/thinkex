import { NextRequest, NextResponse } from "next/server";
import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";
import { requireAuth, withErrorHandling } from "@/lib/api/workspace-helpers";
import { CANVAS_CARD_COLORS } from "@/lib/workspace-state/colors";

const MAX_TITLE_LENGTH = 60;

// Relevant HeroIcons for workspaces (filtered to exclude UI/directional icons like arrows, chevrons, etc.)
const AVAILABLE_ICONS = [
  "AcademicCapIcon", "ArchiveBoxIcon", "AtSymbolIcon", "BanknotesIcon", "BeakerIcon",
  "BellIcon", "BoltIcon", "BookOpenIcon", "BookmarkIcon", "BriefcaseIcon",
  "BugAntIcon", "BuildingLibraryIcon", "BuildingOfficeIcon", "BuildingStorefrontIcon", "CakeIcon",
  "CalculatorIcon", "CalendarIcon", "CameraIcon", "ChartBarIcon", "ChartPieIcon",
  "ChatBubbleLeftIcon", "CheckCircleIcon", "CircleStackIcon", "ClipboardDocumentIcon", "ClipboardIcon",
  "ClockIcon", "CloudIcon", "CodeBracketIcon", "CogIcon", "CommandLineIcon",
  "ComputerDesktopIcon", "CpuChipIcon", "CreditCardIcon", "CubeIcon", "CurrencyDollarIcon",
  "CurrencyEuroIcon", "CurrencyPoundIcon", "CurrencyYenIcon", "DevicePhoneMobileIcon", "DeviceTabletIcon",
  "DocumentTextIcon", "DocumentIcon", "EnvelopeIcon", "ExclamationCircleIcon", "EyeIcon",
  "FaceSmileIcon", "FilmIcon", "FingerPrintIcon", "FireIcon", "FlagIcon",
  "FolderIcon", "FunnelIcon", "GiftIcon", "GlobeAltIcon", "GlobeAmericasIcon",
  "GlobeAsiaAustraliaIcon", "GlobeEuropeAfricaIcon", "HandRaisedIcon", "HashtagIcon", "HeartIcon",
  "HomeIcon", "IdentificationIcon", "InboxIcon", "InformationCircleIcon", "KeyIcon",
  "LanguageIcon", "LifebuoyIcon", "LightBulbIcon", "LinkIcon", "LockClosedIcon",
  "MagnifyingGlassIcon", "MapPinIcon", "MapIcon", "MegaphoneIcon", "MicrophoneIcon",
  "MoonIcon", "MusicalNoteIcon", "NewspaperIcon", "PaintBrushIcon", "PaperAirplaneIcon",
  "PaperClipIcon", "PencilIcon", "PhoneIcon", "PhotoIcon", "PlayIcon",
  "PresentationChartLineIcon", "PrinterIcon", "PuzzlePieceIcon", "QrCodeIcon", "QuestionMarkCircleIcon",
  "RadioIcon", "ReceiptPercentIcon", "RectangleStackIcon", "RocketLaunchIcon", "RssIcon",
  "ScaleIcon", "ScissorsIcon", "ServerIcon", "ShareIcon", "ShieldCheckIcon",
  "ShoppingBagIcon", "ShoppingCartIcon", "SignalIcon", "SparklesIcon", "SpeakerWaveIcon",
  "Square2StackIcon", "Squares2X2Icon", "StarIcon", "SunIcon", "SwatchIcon",
  "TableCellsIcon", "TagIcon", "TicketIcon", "TrophyIcon", "TruckIcon",
  "TvIcon", "UserCircleIcon", "UserGroupIcon", "UserIcon", "UsersIcon",
  "VideoCameraIcon", "ViewColumnsIcon", "WalletIcon", "WifiIcon", "WrenchScrewdriverIcon",
  "WrenchIcon"
];

/**
 * POST /api/workspaces/generate-title
 * Generate a concise workspace title, icon, and color from a user prompt.
 */
async function handlePOST(request: NextRequest) {
  await requireAuth();

  let body;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof TypeError) {
      return NextResponse.json(
        { error: "invalid JSON payload" },
        { status: 400 }
      );
    }
    throw error;
  }

  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";

  if (!prompt) {
    return NextResponse.json(
      { error: "prompt is required and must be a non-empty string" },
      { status: 400 }
    );
  }

  const result = await generateObject({
    model: google("gemini-2.5-flash-lite"),
    schema: z.object({
      title: z.string().describe("A short, concise workspace title (max 5-6 words)"),
      icon: z.string().describe("A HeroIcon name that represents the topic (must be one of the available icons)"),
      color: z.string().describe("A hex color code that fits the topic theme"),
    }),
    system: `You are a helpful assistant that generates workspace metadata. 
Given a user's prompt, generate:
1. A short, concise workspace title (max 5-6 words)
2. An appropriate HeroIcon name from the available icons list
3. A hex color code that matches the topic theme

Available icons (HeroIcons - must be one of these exact names): ${AVAILABLE_ICONS.join(", ")}
Available colors should be vibrant and match the topic theme. Use hex format like #3B82F6.`,
    prompt: `User prompt: "${prompt}"

Generate appropriate workspace title, icon, and color for this topic.`,
  });

  let title = result.object.title.trim();
  if (title.length > MAX_TITLE_LENGTH) {
    title = title.substring(0, MAX_TITLE_LENGTH).trim();
  }
  if (!title) {
    title = "New Workspace";
  }

  // Validate icon - must be in the available icons list
  // If invalid, default to FolderIcon
  let icon = result.object.icon;
  if (!icon || !AVAILABLE_ICONS.includes(icon)) {
    icon = "FolderIcon";
  }

  // Validate color - ensure it's a valid hex color, otherwise pick a random one from palette
  let color = result.object.color;
  if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
    // Pick a random color from the palette
    const randomIndex = Math.floor(Math.random() * CANVAS_CARD_COLORS.length);
    color = CANVAS_CARD_COLORS[randomIndex];
  }

  return NextResponse.json({ title, icon, color });
}

export const POST = withErrorHandling(handlePOST, "POST /api/workspaces/generate-title");
